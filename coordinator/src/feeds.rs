//! Feed Manager (ADR-0013): Podcasts and their Episodes, kept in `DATA_DIR/podcasts/<slug>/`, and the
//! static files published from them. Apart from the Coordinator: nothing here knows about Rooms.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use crate::protocol::{
    BackofficeError, EpisodeDetails, EpisodeType, EpisodeView, PodcastDetails, PodcastView, ShowType,
};
use crate::room_file;

const FILE: &str = "podcast.json";
pub const FEED: &str = "feed.xml";
/// Episode slugs that would collide with the Podcast's own files.
const RESERVED: [&str; 2] = ["feed", "cover"];
/// `podcast:guid` namespace of the Podcasting 2.0 spec.
const PODCAST_NAMESPACE: uuid::Uuid = uuid::uuid!("ead4c236-bf58-58c6-a2c6-a6b28d128cb6");

const MAX_TEXT: usize = 255;
const MAX_NOTES: usize = 64 * 1024;

/// What can be uploaded, and how it is stored.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Upload {
    Cover,
    Audio,
    Image,
    Transcript,
}

impl Upload {
    pub fn max_bytes(self) -> u64 {
        match self {
            // shortcut: one plain upload, no resume; an hour of mp3 is about 60 MB. Use tus if they fail.
            Upload::Audio => 500 << 20,
            Upload::Cover | Upload::Image => 10 << 20,
            Upload::Transcript => 5 << 20,
        }
    }

    /// The file extension for a declared content type, or None when this kind does not take it.
    pub fn extension(self, content_type: &str) -> Option<&'static str> {
        let mime = content_type.split(';').next().unwrap_or("").trim().to_ascii_lowercase();
        match (self, mime.as_str()) {
            (Upload::Audio, "audio/mpeg") => Some("mp3"),
            (Upload::Cover | Upload::Image, "image/jpeg") => Some("jpg"),
            (Upload::Cover | Upload::Image, "image/png") => Some("png"),
            (Upload::Transcript, "text/vtt") => Some("vtt"),
            (Upload::Transcript, "application/x-subrip" | "application/srt" | "text/srt") => Some("srt"),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Episode {
    pub slug: String,
    /// Stable across edits and a replaced mp3, so apps never show it twice.
    pub guid: String,
    #[serde(flatten)]
    pub details: EpisodeDetails,
    /// Bytes of `<slug>.mp3`, once uploaded.
    pub audio: Option<u64>,
    /// File names next to `podcast.json`.
    pub image: Option<String>,
    pub transcript: Option<String>,
}

impl Episode {
    fn live(&self, now: f64) -> bool {
        self.audio.is_some() && self.details.published_at.is_some_and(|t| t <= now)
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Podcast {
    pub slug: String,
    pub creator: Option<String>,
    #[serde(flatten)]
    pub details: PodcastDetails,
    pub cover: Option<String>,
    pub generated_at: Option<f64>,
    /// Files served publicly, as of the last generation: drafts and scheduled Episodes stay out.
    #[serde(default)]
    pub published: Vec<String>,
    pub episodes: Vec<Episode>,
}

pub struct Feeds {
    dir: PathBuf,
    /// `PUBLIC_URL` without a trailing slash: feeds need absolute URLs.
    public_url: String,
    podcasts: Mutex<Vec<Podcast>>,
}

impl Feeds {
    pub fn load(data: &Path, public_url: &str) -> Result<Feeds, String> {
        let dir = data.join("podcasts");
        std::fs::create_dir_all(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
        let mut podcasts: Vec<Podcast> = std::fs::read_dir(&dir)
            .map_err(|e| e.to_string())?
            .flatten()
            .filter_map(|e| {
                let json = std::fs::read(e.path().join(FILE)).ok()?;
                serde_json::from_slice(&json)
                    .inspect_err(|err| eprintln!("skipping {}: {err}", e.path().display()))
                    .ok()
            })
            .collect();
        podcasts.sort_by(|a, b| a.slug.cmp(&b.slug));
        Ok(Feeds {
            dir,
            public_url: public_url.trim_end_matches('/').to_string(),
            podcasts: Mutex::new(podcasts),
        })
    }

    pub fn podcast_url(&self, slug: &str) -> String {
        format!("{}/podcasts/{slug}", self.public_url)
    }

    fn folder(&self, slug: &str) -> PathBuf {
        self.dir.join(slug)
    }

    pub fn views(&self, can_delete: impl Fn(Option<&str>) -> bool) -> Vec<PodcastView> {
        let podcasts = self.podcasts.lock().unwrap();
        podcasts.iter().map(|p| self.view(p, &can_delete)).collect()
    }

    pub fn get(&self, slug: &str, can_delete: impl Fn(Option<&str>) -> bool) -> Option<PodcastView> {
        let podcasts = self.podcasts.lock().unwrap();
        let p = podcasts.iter().find(|p| p.slug == slug)?;
        Some(self.view(p, &can_delete))
    }

    fn view(&self, p: &Podcast, can_delete: &impl Fn(Option<&str>) -> bool) -> PodcastView {
        PodcastView {
            slug: p.slug.clone(),
            details: p.details.clone(),
            cover: p.cover.is_some(),
            feed_url: format!("{}/{FEED}", self.podcast_url(&p.slug)),
            generated_at: p.generated_at,
            can_delete: can_delete(p.creator.as_deref()),
            episodes: p
                .episodes
                .iter()
                .map(|e| EpisodeView {
                    slug: e.slug.clone(),
                    details: e.details.clone(),
                    audio_bytes: e.audio.map(|b| b as f64),
                    image: e.image.is_some(),
                    transcript: e.transcript.is_some(),
                    live: p.published.contains(&format!("{}.mp3", e.slug)),
                })
                .collect(),
        }
    }

    /// A new Podcast named `name`, its slug made from it; any Account may create one.
    pub fn create(&self, name: &str, creator: &str) -> Result<String, BackofficeError> {
        let title = name.trim();
        if !valid_text(title, MAX_TEXT) {
            return Err(BackofficeError::InvalidDetails);
        }
        let base = crate::backoffice::slug(title);
        if !crate::room::valid_name(&base) {
            return Err(BackofficeError::InvalidName);
        }
        let mut podcasts = self.podcasts.lock().unwrap();
        // Folders of deleted Podcasts may linger: create_dir claims a free name atomically.
        let mut failure = None;
        let slug = unique(&base, |s| {
            if podcasts.iter().any(|p| p.slug == s) {
                return true;
            }
            match std::fs::create_dir(self.folder(s)) {
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => true,
                Err(e) => {
                    failure = Some(e); // any other failure would repeat for every suffix
                    false
                }
                Ok(()) => false,
            }
        });
        if let Some(e) = failure {
            eprintln!("cannot create the folder of podcast {slug}: {e}");
            return Err(BackofficeError::NotSaved);
        }
        let podcast = Podcast {
            slug: slug.clone(),
            creator: Some(creator.into()),
            details: PodcastDetails {
                title: title.into(),
                ..Default::default()
            },
            cover: None,
            generated_at: None,
            published: vec![],
            episodes: vec![],
        };
        self.save(&podcast)?;
        podcasts.push(podcast);
        podcasts.sort_by(|a, b| a.slug.cmp(&b.slug));
        Ok(slug)
    }

    /// Runs `change` on a Podcast, then saves it and regenerates its files.
    fn change<T>(
        &self,
        slug: &str,
        change: impl FnOnce(&mut Podcast) -> Result<T, BackofficeError>,
    ) -> Result<T, BackofficeError> {
        let mut podcasts = self.podcasts.lock().unwrap();
        let podcast = podcasts
            .iter_mut()
            .find(|p| p.slug == slug)
            .ok_or(BackofficeError::NotFound)?;
        let mut edited = podcast.clone();
        let out = change(&mut edited)?;
        self.generate(&mut edited)?;
        *podcast = edited;
        Ok(out)
    }

    pub fn edit(&self, slug: &str, details: PodcastDetails) -> Result<(), BackofficeError> {
        let details = check_podcast(details)?;
        self.change(slug, |p| {
            p.details = details;
            Ok(())
        })
    }

    pub fn regenerate(&self, slug: &str) -> Result<(), BackofficeError> {
        self.change(slug, |_| Ok(()))
    }

    /// Who created it, to check who may delete it.
    pub fn creator(&self, slug: &str) -> Option<Option<String>> {
        let podcasts = self.podcasts.lock().unwrap();
        podcasts.iter().find(|p| p.slug == slug).map(|p| p.creator.clone())
    }

    /// `podcast.json` goes first: a Podcast half deleted by a crash is not loaded again.
    pub fn delete(&self, slug: &str) -> Result<(), BackofficeError> {
        let mut podcasts = self.podcasts.lock().unwrap();
        let at = podcasts
            .iter()
            .position(|p| p.slug == slug)
            .ok_or(BackofficeError::NotFound)?;
        let dir = self.folder(slug);
        std::fs::remove_file(dir.join(FILE)).map_err(|_| BackofficeError::NotSaved)?;
        podcasts.remove(at);
        if let Err(e) = std::fs::remove_dir_all(&dir) {
            eprintln!("podcast {slug} deleted, but its folder stays: {e}");
        }
        Ok(())
    }

    pub fn create_episode(&self, slug: &str, details: EpisodeDetails) -> Result<String, BackofficeError> {
        let details = check_episode(details)?;
        self.change(slug, |p| {
            let base = crate::backoffice::slug(&details.title);
            if !crate::room::valid_name(&base) {
                return Err(BackofficeError::InvalidName);
            }
            let ep = unique(&base, |s| {
                RESERVED.contains(&s) || p.episodes.iter().any(|e| e.slug == s)
            });
            p.episodes.push(Episode {
                slug: ep.clone(),
                guid: uuid::Uuid::now_v7().to_string(),
                details,
                audio: None,
                image: None,
                transcript: None,
            });
            Ok(ep)
        })
    }

    pub fn edit_episode(&self, slug: &str, ep: &str, details: EpisodeDetails) -> Result<(), BackofficeError> {
        let details = check_episode(details)?;
        self.change(slug, |p| {
            episode(p, ep)?.details = details;
            Ok(())
        })
    }

    pub fn delete_episode(&self, slug: &str, ep: &str) -> Result<(), BackofficeError> {
        let dir = self.folder(slug);
        self.change(slug, |p| {
            let at = p
                .episodes
                .iter()
                .position(|e| e.slug == ep)
                .ok_or(BackofficeError::NotFound)?;
            let gone = p.episodes.remove(at);
            let files = [gone.audio.map(|_| format!("{ep}.mp3")), gone.image, gone.transcript];
            for file in files.into_iter().flatten() {
                let _ = std::fs::remove_file(dir.join(file));
            }
            Ok(())
        })
    }

    /// Where an upload is written before `store` moves it in place; unique, so uploads never mix.
    pub fn upload_path(&self, slug: &str) -> Option<PathBuf> {
        let exists = self.podcasts.lock().unwrap().iter().any(|p| p.slug == slug);
        exists.then(|| self.folder(slug).join(format!("{}.upload", crate::random_token())))
    }

    /// Moves a finished upload in place: the Podcast's cover, or a file of Episode `ep`.
    pub fn store(
        &self,
        slug: &str,
        ep: Option<&str>,
        kind: Upload,
        ext: &str,
        upload: &Path,
        bytes: u64,
    ) -> Result<(), BackofficeError> {
        let dir = self.folder(slug);
        let result = self.change(slug, |p| {
            let stem = ep.unwrap_or("cover");
            let name = format!("{stem}.{ext}");
            let old = match (kind, ep) {
                (Upload::Cover, _) => p.cover.replace(name.clone()),
                (Upload::Audio, Some(ep)) => {
                    episode(p, ep)?.audio = Some(bytes);
                    None
                }
                (Upload::Image, Some(ep)) => episode(p, ep)?.image.replace(name.clone()),
                (Upload::Transcript, Some(ep)) => episode(p, ep)?.transcript.replace(name.clone()),
                _ => return Err(BackofficeError::NotFound),
            };
            std::fs::rename(upload, dir.join(&name)).map_err(|_| BackofficeError::NotSaved)?;
            // A png replaced by a jpg would linger otherwise.
            if let Some(old) = old.filter(|o| *o != name) {
                let _ = std::fs::remove_file(dir.join(old));
            }
            Ok(())
        });
        let _ = std::fs::remove_file(upload); // left only when something failed
        result
    }

    /// A file anyone may download: one listed at the last generation, so never a draft's.
    pub fn public_file(&self, slug: &str, file: &str) -> Option<PathBuf> {
        let podcasts = self.podcasts.lock().unwrap();
        let p = podcasts.iter().find(|p| p.slug == slug)?;
        p.published
            .iter()
            .any(|f| f == file)
            .then(|| self.folder(slug).join(file))
    }

    fn save(&self, p: &Podcast) -> Result<(), BackofficeError> {
        let json = serde_json::to_vec_pretty(p).expect("a Podcast always serializes");
        room_file::write_private(&self.folder(&p.slug), FILE, &json).map_err(|e| {
            eprintln!("cannot save podcast {}: {e}", p.slug);
            BackofficeError::NotSaved
        })
    }

    /// Writes the feed and saves the Podcast with the list of what is now public.
    fn generate(&self, p: &mut Podcast) -> Result<(), BackofficeError> {
        let now = crate::now_ms();
        let xml = feed_xml(p, &self.podcast_url(&p.slug), now);
        let mut published = vec![FEED.to_string()];
        published.extend(p.cover.clone());
        for e in p.episodes.iter().filter(|e| e.live(now)) {
            published.push(format!("{}.mp3", e.slug));
            published.extend(e.image.clone());
            published.extend(e.transcript.clone());
        }
        let dir = self.folder(&p.slug);
        std::fs::write(dir.join(format!("{FEED}.tmp")), xml)
            .and_then(|_| std::fs::rename(dir.join(format!("{FEED}.tmp")), dir.join(FEED)))
            .map_err(|e| {
                eprintln!("cannot write the feed of {}: {e}", p.slug);
                BackofficeError::NotSaved
            })?;
        p.generated_at = Some(now);
        p.published = published;
        self.save(p)
    }
}

fn episode<'a>(p: &'a mut Podcast, ep: &str) -> Result<&'a mut Episode, BackofficeError> {
    p.episodes
        .iter_mut()
        .find(|e| e.slug == ep)
        .ok_or(BackofficeError::NotFound)
}

/// `base`, or `base-2`, `base-3`… the first one `taken` refuses; never longer than a Room slug.
fn unique(base: &str, mut taken: impl FnMut(&str) -> bool) -> String {
    (1..)
        .map(|n| {
            if n == 1 {
                return base.to_string();
            }
            let suffix = format!("-{n}");
            let mut stem = base.to_string();
            stem.truncate(40 - suffix.len());
            format!("{}{suffix}", stem.trim_end_matches('-'))
        })
        .find(|s| !taken(s))
        .expect("some suffix is free")
}

fn valid_text(text: &str, max: usize) -> bool {
    text.len() <= max
        && !text
            .chars()
            .any(|c| c.is_control() && c != '\n' && c != '\r' && c != '\t')
}

fn check_podcast(mut d: PodcastDetails) -> Result<PodcastDetails, BackofficeError> {
    for field in [
        &mut d.title,
        &mut d.language,
        &mut d.category,
        &mut d.author,
        &mut d.owner_email,
        &mut d.copyright,
    ] {
        *field = field.trim().to_string();
    }
    let short = [
        &d.title,
        &d.language,
        &d.category,
        &d.author,
        &d.owner_email,
        &d.copyright,
    ];
    let language_ok = d.language.is_empty()
        || d.language.len() <= 35 && d.language.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
    let email_ok =
        d.owner_email.is_empty() || (d.owner_email.contains('@') && !d.owner_email.contains(char::is_whitespace));
    if d.title.is_empty()
        || !short.iter().all(|f| valid_text(f, MAX_TEXT))
        || !valid_text(&d.description, MAX_NOTES)
        || !language_ok
        || !email_ok
    {
        return Err(BackofficeError::InvalidDetails);
    }
    Ok(d)
}

fn check_episode(mut d: EpisodeDetails) -> Result<EpisodeDetails, BackofficeError> {
    d.title = d.title.trim().to_string();
    let finite = |v: Option<f64>| v.is_none_or(|v| v.is_finite() && v >= 0.0);
    if d.title.is_empty()
        || !valid_text(&d.title, MAX_TEXT)
        || !valid_text(&d.notes, MAX_NOTES)
        || !finite(d.published_at)
        || !finite(d.duration)
    {
        return Err(BackofficeError::InvalidDetails);
    }
    Ok(d)
}

/// Escapes text for XML content and attributes.
fn esc(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            c => out.push(c),
        }
    }
    out
}

/// HTML show notes inside CDATA, where only `]]>` would end it early.
fn cdata(html: &str) -> String {
    format!("<![CDATA[{}]]>", html.replace("]]>", "]]]]><![CDATA[>"))
}

/// RFC 2822 in UTC, e.g. `Tue, 17 Nov 2026 08:00:00 +0000`, as RSS `pubDate` wants.
fn rfc2822(ms: f64) -> String {
    const DAYS: [&str; 7] = ["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"];
    const MONTHS: [&str; 12] = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    let secs = (ms / 1000.0).floor() as i64;
    let days = secs.div_euclid(86_400);
    let rest = secs.rem_euclid(86_400);
    let date = crate::utc_date(ms); // YYYY-MM-DD
    let (y, m, d) = (&date[0..4], date[5..7].parse::<usize>().unwrap_or(1), &date[8..10]);
    format!(
        "{}, {d} {} {y} {:02}:{:02}:{:02} +0000",
        DAYS[days.rem_euclid(7) as usize],
        MONTHS[m - 1],
        rest / 3600,
        rest % 3600 / 60,
        rest % 60
    )
}

fn yes_no(explicit: bool) -> &'static str {
    if explicit { "true" } else { "false" }
}

/// RSS 2.0 with the `itunes` and `podcast` namespaces: what Apple Podcasts and the rest read.
fn feed_xml(p: &Podcast, url: &str, now: f64) -> String {
    let d = &p.details;
    let feed_url = format!("{url}/{FEED}");
    let guid = uuid::Uuid::new_v5(
        &PODCAST_NAMESPACE,
        feed_url.split_once("://").map_or(&*feed_url, |(_, r)| r).as_bytes(),
    );
    let mut x = String::new();
    x.push_str(r#"<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
"#);
    let tag = |x: &mut String, name: &str, value: &str| {
        if !value.is_empty() {
            x.push_str(&format!("<{name}>{}</{name}>\n", esc(value)));
        }
    };
    tag(&mut x, "title", &d.title);
    tag(&mut x, "link", url);
    x.push_str(&format!(
        "<atom:link href=\"{}\" rel=\"self\" type=\"application/rss+xml\"/>\n",
        esc(&feed_url)
    ));
    x.push_str(&format!("<description>{}</description>\n", cdata(&d.description)));
    tag(&mut x, "language", &d.language);
    tag(&mut x, "copyright", &d.copyright);
    tag(&mut x, "lastBuildDate", &rfc2822(now));
    tag(&mut x, "generator", "SimplyCaster");
    tag(&mut x, "itunes:author", &d.author);
    if !d.owner_email.is_empty() {
        x.push_str(&format!(
            "<itunes:owner><itunes:name>{}</itunes:name><itunes:email>{}</itunes:email></itunes:owner>\n",
            esc(&d.author),
            esc(&d.owner_email)
        ));
    }
    if let Some(cover) = &p.cover {
        x.push_str(&format!(
            "<itunes:image href=\"{}\"/>\n",
            esc(&format!("{url}/{cover}"))
        ));
        x.push_str(&format!(
            "<image><url>{}</url><title>{}</title><link>{}</link></image>\n",
            esc(&format!("{url}/{cover}")),
            esc(&d.title),
            esc(url)
        ));
    }
    if !d.category.is_empty() {
        x.push_str(&format!("<itunes:category text=\"{}\"/>\n", esc(&d.category)));
    }
    tag(&mut x, "itunes:explicit", yes_no(d.explicit));
    tag(
        &mut x,
        "itunes:type",
        if d.show_type == ShowType::Serial {
            "serial"
        } else {
            "episodic"
        },
    );
    tag(&mut x, "podcast:guid", &guid.to_string());

    let mut live: Vec<&Episode> = p.episodes.iter().filter(|e| e.live(now)).collect();
    live.sort_by(|a, b| b.details.published_at.partial_cmp(&a.details.published_at).unwrap());
    for e in live {
        let ed = &e.details;
        x.push_str("<item>\n");
        tag(&mut x, "title", &ed.title);
        tag(&mut x, "link", &format!("{url}/{}", e.slug));
        x.push_str(&format!("<description>{}</description>\n", cdata(&ed.notes)));
        x.push_str(&format!("<guid isPermaLink=\"false\">{}</guid>\n", esc(&e.guid)));
        tag(&mut x, "pubDate", &rfc2822(ed.published_at.unwrap_or(now)));
        x.push_str(&format!(
            "<enclosure url=\"{}\" length=\"{}\" type=\"audio/mpeg\"/>\n",
            esc(&format!("{url}/{}.mp3", e.slug)),
            e.audio.unwrap_or(0)
        ));
        if let Some(secs) = ed.duration {
            tag(&mut x, "itunes:duration", &(secs.round() as u64).to_string());
        }
        if let Some(explicit) = ed.explicit {
            tag(&mut x, "itunes:explicit", yes_no(explicit));
        }
        let kind = match ed.episode_type {
            EpisodeType::Full => "full",
            EpisodeType::Trailer => "trailer",
            EpisodeType::Bonus => "bonus",
        };
        tag(&mut x, "itunes:episodeType", kind);
        if let Some(season) = ed.season {
            tag(&mut x, "itunes:season", &season.to_string());
        }
        if let Some(number) = ed.number {
            tag(&mut x, "itunes:episode", &number.to_string());
        }
        if let Some(image) = &e.image {
            x.push_str(&format!(
                "<itunes:image href=\"{}\"/>\n",
                esc(&format!("{url}/{image}"))
            ));
        }
        if let Some(t) = &e.transcript {
            let kind = if t.ends_with(".vtt") {
                "text/vtt"
            } else {
                "application/x-subrip"
            };
            x.push_str(&format!(
                "<podcast:transcript url=\"{}\" type=\"{kind}\"/>\n",
                esc(&format!("{url}/{t}"))
            ));
        }
        x.push_str("</item>\n");
    }
    x.push_str("</channel>\n</rss>\n");
    x
}

#[cfg(test)]
mod tests {
    use super::*;

    fn feeds() -> (Feeds, PathBuf) {
        let dir = std::env::temp_dir().join(crate::random_token());
        std::fs::create_dir_all(&dir).unwrap();
        (Feeds::load(&dir, "https://pod.example/").unwrap(), dir)
    }

    fn details(title: &str, published_at: Option<f64>) -> EpisodeDetails {
        EpisodeDetails {
            title: title.into(),
            notes: "<p>Hi & bye</p>".into(),
            published_at,
            duration: Some(2745.4),
            ..Default::default()
        }
    }

    fn upload(f: &Feeds, slug: &str, ep: Option<&str>, kind: Upload, ext: &str, content: &[u8]) {
        let path = f.upload_path(slug).unwrap();
        std::fs::write(&path, content).unwrap();
        f.store(slug, ep, kind, ext, &path, content.len() as u64).unwrap();
    }

    #[test]
    fn rfc2822_dates() {
        assert_eq!(rfc2822(0.0), "Thu, 01 Jan 1970 00:00:00 +0000");
        assert_eq!(rfc2822(1_794_902_400_000.0), "Tue, 17 Nov 2026 08:00:00 +0000");
    }

    #[test]
    fn slugs_are_unique_and_avoid_reserved_names() {
        let (f, _) = feeds();
        assert_eq!(f.create("Mi Podcast", "a").unwrap(), "mi-podcast");
        assert_eq!(f.create("Mi podcast", "a").unwrap(), "mi-podcast-2");
        assert_eq!(
            f.create_episode("mi-podcast", details("Cover", None)).unwrap(),
            "cover-2"
        );
        assert_eq!(f.create_episode("mi-podcast", details("Uno", None)).unwrap(), "uno");
        assert_eq!(f.create_episode("mi-podcast", details("uno", None)).unwrap(), "uno-2");
        let long = "a".repeat(40);
        assert_eq!(unique(&long, |s| s == long), format!("{}-2", "a".repeat(38)));
    }

    #[test]
    fn only_live_episodes_are_in_the_feed_and_public() {
        let (f, _) = feeds();
        let slug = f.create("Show", "a").unwrap();
        let past = crate::now_ms() - 60_000.0;
        let live = f.create_episode(&slug, details("Live", Some(past))).unwrap();
        let draft = f.create_episode(&slug, details("Draft", None)).unwrap();
        let later = f
            .create_episode(&slug, details("Later", Some(past + 86_400_000.0)))
            .unwrap();
        for ep in [&live, &draft, &later] {
            upload(&f, &slug, Some(ep), Upload::Audio, "mp3", b"ID3");
        }
        upload(&f, &slug, None, Upload::Cover, "png", b"png");
        let xml = std::fs::read_to_string(f.folder(&slug).join(FEED)).unwrap();
        assert_eq!(xml.matches("<item>").count(), 1);
        assert!(xml.contains("https://pod.example/podcasts/show/live.mp3\" length=\"3\""));
        assert!(xml.contains("<![CDATA[<p>Hi & bye</p>]]>"));
        assert!(xml.contains("<itunes:duration>2745</itunes:duration>"));
        assert!(xml.contains("<itunes:image href=\"https://pod.example/podcasts/show/cover.png\"/>"));
        assert!(f.public_file(&slug, "live.mp3").is_some());
        assert!(f.public_file(&slug, "draft.mp3").is_none());
        assert!(f.public_file(&slug, "later.mp3").is_none());
        assert!(f.public_file(&slug, "podcast.json").is_none());
        assert!(f.public_file(&slug, "cover.png").is_some());
    }

    #[test]
    fn a_new_cover_type_replaces_the_old_file_and_survives_a_restart() {
        let (f, dir) = feeds();
        let slug = f.create("Show", "a").unwrap();
        upload(&f, &slug, None, Upload::Cover, "png", b"png");
        upload(&f, &slug, None, Upload::Cover, "jpg", b"jpg");
        assert!(!f.folder(&slug).join("cover.png").exists());
        let again = Feeds::load(&dir, "https://pod.example").unwrap();
        assert!(again.public_file(&slug, "cover.jpg").is_some());
    }

    #[test]
    fn deleting_removes_files() {
        let (f, _) = feeds();
        let slug = f.create("Show", "a").unwrap();
        let ep = f.create_episode(&slug, details("Uno", Some(0.0))).unwrap();
        upload(&f, &slug, Some(&ep), Upload::Audio, "mp3", b"ID3");
        f.delete_episode(&slug, &ep).unwrap();
        assert!(!f.folder(&slug).join("uno.mp3").exists());
        assert!(f.public_file(&slug, "uno.mp3").is_none());
        f.delete(&slug).unwrap();
        assert!(!f.folder(&slug).exists());
    }

    #[test]
    fn uploads_are_typed() {
        assert_eq!(Upload::Audio.extension("audio/mpeg"), Some("mp3"));
        assert_eq!(Upload::Audio.extension("image/png"), None);
        assert_eq!(Upload::Cover.extension("image/PNG"), Some("png"));
        assert_eq!(Upload::Transcript.extension("application/x-subrip"), Some("srt"));
    }

    #[test]
    fn feed_text_is_escaped() {
        assert_eq!(esc("a<b & \"c\""), "a&lt;b &amp; &quot;c&quot;");
        assert_eq!(cdata("x]]>y"), "<![CDATA[x]]]]><![CDATA[>y]]>");
    }
}
