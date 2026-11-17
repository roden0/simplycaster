//! What the Feed Manager publishes besides the RSS feed (ADR-0013): JSON Feed 1.1, and an HTML page per
//! Podcast and per Episode with schema.org JSON-LD and Open Graph, for people, search engines and links.

use serde_json::json;

use crate::feeds::{Episode, Podcast, esc};

/// Fixed text of the public pages. `en` only for now (ADR-0013): another language is another `Text`.
struct Text {
    episodes: &'static str,
    no_episodes: &'static str,
    subscribe: &'static str,
    rss: &'static str,
    json: &'static str,
    transcript: &'static str,
    season: &'static str,
    episode: &'static str,
    all_episodes: &'static str,
}

const EN: Text = Text {
    episodes: "Episodes",
    no_episodes: "No episodes yet.",
    subscribe: "Subscribe",
    rss: "RSS feed",
    json: "JSON feed",
    transcript: "Transcript",
    season: "Season",
    episode: "Episode",
    all_episodes: "All episodes",
};

/// Pages carry the Account's HTML from show notes and share the origin of the backoffice: no script
/// runs on them, and the sandbox keeps them off its cookies, whatever the notes contain.
pub const PAGE_POLICY: &str = "default-src 'none'; img-src * data:; media-src *; style-src 'unsafe-inline'; \
    base-uri 'none'; form-action 'none'; sandbox allow-popups allow-popups-to-escape-sandbox";

/// `2026-11-17T08:00:00Z`.
fn rfc3339(ms: f64) -> String {
    let secs = (ms / 1000.0).floor() as i64;
    let rest = secs.rem_euclid(86_400);
    format!(
        "{}T{:02}:{:02}:{:02}Z",
        crate::utc_date(ms),
        rest / 3600,
        rest % 3600 / 60,
        rest % 60
    )
}

/// `1:35`, or `1:02:05` past an hour.
fn clock(seconds: f64) -> String {
    let s = seconds.round() as u64;
    if s >= 3600 {
        format!("{}:{:02}:{:02}", s / 3600, s % 3600 / 60, s % 60)
    } else {
        format!("{}:{:02}", s / 60, s % 60)
    }
}

/// Show notes as plain text, for descriptions in metadata. Block tags become spaces; inline ones vanish.
fn plain(html: &str, max_chars: usize) -> String {
    const BLOCKS: [&str; 13] = [
        "p",
        "br",
        "li",
        "ul",
        "ol",
        "div",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "blockquote",
    ];
    let mut text = String::new();
    let mut tag: Option<String> = None;
    for c in html.chars() {
        match (&mut tag, c) {
            (None, '<') => tag = Some(String::new()),
            (Some(name), '>') => {
                let name = name
                    .trim_start_matches('/')
                    .split([' ', '/'])
                    .next()
                    .unwrap_or("")
                    .to_ascii_lowercase();
                if BLOCKS.contains(&name.as_str()) {
                    text.push(' ');
                }
                tag = None;
            }
            (Some(name), c) => name.push(c),
            (None, c) => text.push(c),
        }
    }
    let text = text
        .replace("&nbsp;", " ")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&amp;", "&");
    let words: Vec<&str> = text.split_whitespace().collect();
    let joined = words.join(" ");
    if joined.chars().count() <= max_chars {
        return joined;
    }
    let cut: String = joined.chars().take(max_chars - 1).collect();
    format!("{}…", cut.trim_end())
}

/// JSON inside `<script type="application/ld+json">`: `<` escaped, so no text can close the element.
fn ld_json(value: &serde_json::Value) -> String {
    value.to_string().replace('<', "\\u003c")
}

/// Episodes in the feed, newest first.
pub(crate) fn live(p: &Podcast, now: f64) -> Vec<&Episode> {
    let mut live: Vec<&Episode> = p.episodes.iter().filter(|e| e.live(now)).collect();
    live.sort_by(|a, b| b.details.published_at.partial_cmp(&a.details.published_at).unwrap());
    live
}

fn image_of(p: &Podcast, e: Option<&Episode>, url: &str) -> Option<String> {
    e.and_then(|e| e.image.as_ref())
        .or(p.cover.as_ref())
        .map(|file| format!("{url}/{file}"))
}

/// JSON Feed 1.1: the same Episodes as the RSS feed, with their mp3 as attachments.
pub fn feed_json(p: &Podcast, url: &str, now: f64) -> String {
    let d = &p.details;
    let items: Vec<_> = live(p, now)
        .into_iter()
        .map(|e| {
            let mut attachment = json!({
                "url": format!("{url}/{}.mp3", e.slug),
                "mime_type": "audio/mpeg",
                "size_in_bytes": e.audio.unwrap_or(0),
            });
            if let Some(secs) = e.details.duration {
                attachment["duration_in_seconds"] = json!(secs.round() as u64);
            }
            let mut item = json!({
                "id": e.guid,
                "url": format!("{url}/{}", e.slug),
                "title": e.details.title,
                "content_html": e.details.notes,
                "summary": plain(&e.details.notes, 300),
                "date_published": rfc3339(e.details.published_at.unwrap_or(now)),
                "attachments": [attachment],
            });
            if let Some(image) = e.image.as_ref() {
                item["image"] = json!(format!("{url}/{image}"));
            }
            item
        })
        .collect();
    let mut feed = json!({
        "version": "https://jsonfeed.org/version/1.1",
        "title": d.title,
        "home_page_url": url,
        "feed_url": format!("{url}/feed.json"),
        "description": plain(&d.description, 4000),
        "items": items,
    });
    if !d.language.is_empty() {
        feed["language"] = json!(d.language);
    }
    if !d.author.is_empty() {
        feed["authors"] = json!([{ "name": d.author }]);
    }
    if let Some(cover) = image_of(p, None, url) {
        feed["icon"] = json!(cover);
    }
    serde_json::to_string_pretty(&feed).expect("JSON always serializes")
}

/// The `<head>` both pages share: title, description, feeds, Open Graph and JSON-LD.
struct Head<'a> {
    title: &'a str,
    description: &'a str,
    page_url: &'a str,
    image: Option<&'a str>,
    /// `og:type` and, for an Episode, `og:audio`.
    extra_meta: &'a str,
    ld: &'a serde_json::Value,
}

fn head(p: &Podcast, base: &str, h: Head) -> String {
    let Head {
        title,
        description,
        page_url,
        image,
        extra_meta,
        ld,
    } = h;
    let mut h = format!(
        r#"<!doctype html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{description}">
<link rel="canonical" href="{page_url}">
<link rel="alternate" type="application/rss+xml" title="{podcast}" href="{base}/feed.xml">
<link rel="alternate" type="application/feed+json" title="{podcast}" href="{base}/feed.json">
<meta property="og:site_name" content="{podcast}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{description}">
<meta property="og:url" content="{page_url}">
"#,
        lang = esc(if p.details.language.is_empty() {
            "en"
        } else {
            &p.details.language
        }),
        title = esc(title),
        description = esc(description),
        page_url = esc(page_url),
        podcast = esc(&p.details.title),
        base = esc(base),
    );
    if let Some(image) = image {
        h.push_str(&format!("<meta property=\"og:image\" content=\"{}\">\n", esc(image)));
    }
    h.push_str(extra_meta);
    h.push_str(&format!(
        "<script type=\"application/ld+json\">{}</script>\n<style>{STYLE}</style>\n</head>\n",
        ld_json(ld)
    ));
    h
}

const STYLE: &str = "body{margin:0;font:16px/1.6 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;\
color:#1d1d1b;background:#f7f7f5}main{max-width:44rem;margin:0 auto;padding:1.5rem 1rem}\
header{display:flex;gap:1rem;align-items:center;margin-bottom:1.5rem}header img{width:7rem;height:7rem;\
border-radius:.375rem;object-fit:cover}h1{font-size:1.5rem;margin:0 0 .25rem;line-height:1.25}\
h2{font-size:1.125rem;margin:2rem 0 .5rem}.meta{color:#5f5f5a;font-size:.875rem}audio{width:100%;margin:1rem 0}\
ul.episodes{list-style:none;padding:0}ul.episodes li{padding:.75rem 0;border-top:1px solid #dcdcd6}\
a{color:#1f5fae}.notes img{max-width:100%}footer{margin-top:2rem;font-size:.875rem;color:#5f5f5a}\
@media(max-width:30rem){header img{width:4.5rem;height:4.5rem}}@media(prefers-color-scheme:dark){body{color:#ececea;background:#161615}.meta,footer{color:#a6a6a0}\
ul.episodes li{border-color:#3a3a37}a{color:#7fb0ff}}";

fn subscribe(url: &str, t: &Text) -> String {
    format!(
        "<footer>{}: <a href=\"{u}/feed.xml\">{}</a> · <a href=\"{u}/feed.json\">{}</a></footer>\n",
        esc(t.subscribe),
        esc(t.rss),
        esc(t.json),
        u = esc(url)
    )
}

fn episode_meta(e: &Episode, t: &Text) -> String {
    let mut parts = vec![];
    if let Some(at) = e.details.published_at {
        let date = crate::utc_date(at);
        parts.push(format!("<time datetime=\"{date}\">{date}</time>"));
    }
    if let Some(season) = e.details.season {
        parts.push(format!("{} {season}", esc(t.season)));
    }
    if let Some(number) = e.details.number {
        parts.push(format!("{} {number}", esc(t.episode)));
    }
    if let Some(secs) = e.details.duration {
        parts.push(clock(secs));
    }
    parts.join(" · ")
}

/// `/podcasts/<slug>`: the Podcast and its Episodes in the feed.
pub fn podcast_page(p: &Podcast, url: &str, now: f64) -> String {
    let t = &EN;
    let d = &p.details;
    let image = image_of(p, None, url);
    let mut ld = json!({
        "@context": "https://schema.org",
        "@type": "PodcastSeries",
        "name": d.title,
        "url": url,
        "description": plain(&d.description, 4000),
        "webFeed": format!("{url}/feed.xml"),
    });
    if let Some(image) = &image {
        ld["image"] = json!(image);
    }
    if !d.author.is_empty() {
        ld["author"] = json!({ "@type": "Person", "name": d.author });
    }
    let og = "<meta property=\"og:type\" content=\"website\">\n";
    let description = plain(&d.description, 200);
    let mut html = head(
        p,
        url,
        Head {
            title: &d.title,
            description: &description,
            page_url: url,
            image: image.as_deref(),
            extra_meta: og,
            ld: &ld,
        },
    );
    html.push_str("<body>\n<main>\n<header>");
    if let Some(image) = &image {
        html.push_str(&format!("<img src=\"{}\" alt=\"\">", esc(image)));
    }
    html.push_str(&format!("<div><h1>{}</h1>", esc(&d.title)));
    if !d.author.is_empty() {
        html.push_str(&format!("<div class=\"meta\">{}</div>", esc(&d.author)));
    }
    html.push_str("</div></header>\n");
    html.push_str(&format!("<div class=\"notes\">{}</div>\n", d.description));
    html.push_str(&format!("<h2>{}</h2>\n", esc(t.episodes)));
    let episodes = live(p, now);
    if episodes.is_empty() {
        html.push_str(&format!("<p>{}</p>\n", esc(t.no_episodes)));
    } else {
        html.push_str("<ul class=\"episodes\">\n");
        for e in episodes {
            html.push_str(&format!(
                "<li><a href=\"{}\">{}</a><div class=\"meta\">{}</div></li>\n",
                esc(&format!("{url}/{}", e.slug)),
                esc(&e.details.title),
                episode_meta(e, t)
            ));
        }
        html.push_str("</ul>\n");
    }
    html.push_str(&subscribe(url, t));
    html.push_str("</main>\n</body>\n</html>\n");
    html
}

/// `/podcasts/<slug>/<episode>`: one Episode, with a player and its notes.
pub fn episode_page(p: &Podcast, e: &Episode, url: &str) -> String {
    let t = &EN;
    let page_url = format!("{url}/{}", e.slug);
    let mp3 = format!("{url}/{}.mp3", e.slug);
    let image = image_of(p, Some(e), url);
    let description = plain(&e.details.notes, 200);
    let mut ld = json!({
        "@context": "https://schema.org",
        "@type": "PodcastEpisode",
        "name": e.details.title,
        "url": page_url,
        "description": plain(&e.details.notes, 4000),
        "associatedMedia": { "@type": "MediaObject", "contentUrl": mp3, "encodingFormat": "audio/mpeg" },
        "partOfSeries": { "@type": "PodcastSeries", "name": p.details.title, "url": url },
    });
    if let Some(at) = e.details.published_at {
        ld["datePublished"] = json!(crate::utc_date(at));
    }
    if let Some(secs) = e.details.duration {
        ld["timeRequired"] = json!(format!("PT{}S", secs.round() as u64));
    }
    if let Some(number) = e.details.number {
        ld["episodeNumber"] = json!(number);
    }
    if let Some(season) = e.details.season {
        ld["partOfSeason"] = json!({ "@type": "PodcastSeason", "seasonNumber": season });
    }
    if let Some(image) = &image {
        ld["image"] = json!(image);
    }
    let og = format!(
        "<meta property=\"og:type\" content=\"website\">\n<meta property=\"og:audio\" content=\"{}\">\n<meta property=\"og:audio:type\" content=\"audio/mpeg\">\n",
        esc(&mp3)
    );
    let title = format!("{} · {}", e.details.title, p.details.title);
    let mut html = head(
        p,
        url,
        Head {
            title: &title,
            description: &description,
            page_url: &page_url,
            image: image.as_deref(),
            extra_meta: &og,
            ld: &ld,
        },
    );
    html.push_str("<body>\n<main>\n<header>");
    if let Some(image) = &image {
        html.push_str(&format!("<img src=\"{}\" alt=\"\">", esc(image)));
    }
    html.push_str(&format!(
        "<div><h1>{}</h1><div class=\"meta\"><a href=\"{}\">{}</a> · {}</div></div></header>\n",
        esc(&e.details.title),
        esc(url),
        esc(&p.details.title),
        episode_meta(e, t)
    ));
    html.push_str(&format!(
        "<audio controls preload=\"none\" src=\"{}\"></audio>\n",
        esc(&mp3)
    ));
    html.push_str(&format!("<div class=\"notes\">{}</div>\n", e.details.notes));
    if let Some(transcript) = &e.transcript {
        html.push_str(&format!(
            "<p><a href=\"{}\">{}</a></p>\n",
            esc(&format!("{url}/{transcript}")),
            esc(t.transcript)
        ));
    }
    html.push_str(&format!(
        "<p><a href=\"{}\">← {}</a></p>\n",
        esc(url),
        esc(t.all_episodes)
    ));
    html.push_str(&subscribe(url, t));
    html.push_str("</main>\n</body>\n</html>\n");
    html
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_text_from_notes() {
        assert_eq!(
            plain("<p>Hi &amp; <b>bye</b></p><p>x <a href=\"/\">y</a>.</p>", 100),
            "Hi & bye x y."
        );
        assert_eq!(plain("abcdef", 4), "abc…");
    }

    #[test]
    fn json_ld_cannot_close_its_script() {
        let v = json!({ "name": "</script><script>alert(1)</script>" });
        assert!(!ld_json(&v).contains("</script>"));
    }

    #[test]
    fn times() {
        assert_eq!(rfc3339(1_794_902_400_000.0), "2026-11-17T08:00:00Z");
        assert_eq!(clock(95.4), "1:35");
        assert_eq!(clock(3725.0), "1:02:05");
    }
}
