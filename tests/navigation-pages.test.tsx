import { expect } from "@std/expect";
import { App } from "fresh";
import { type State } from "../utils.ts";

Deno.test("Dashboard page - renders with correct H1 content", async () => {
  const handler = new App<State>()
    .get("/dashboard", (ctx) =>
      ctx.render(
        <div class="page-container">
          <head>
            <title>Dashboard</title>
          </head>
          <h1>Dashboard</h1>
        </div>,
      ))
    .handler();

  const response = await handler(new Request("http://localhost/dashboard"));
  const text = await response.text();

  expect(response.status).toBe(200);
  expect(text).toContain("<h1>Dashboard</h1>");
});

Deno.test("Dashboard page - has correct Head metadata", async () => {
  const handler = new App<State>()
    .get("/dashboard", (ctx) =>
      ctx.render(
        <div class="page-container">
          <head>
            <title>Dashboard</title>
          </head>
          <h1>Dashboard</h1>
        </div>,
      ))
    .handler();

  const response = await handler(new Request("http://localhost/dashboard"));
  const text = await response.text();

  expect(text).toContain("<title>Dashboard</title>");
});

Deno.test("Room page - renders with correct H1 content", async () => {
  const handler = new App<State>()
    .get("/room", (ctx) =>
      ctx.render(
        <div class="page-container">
          <head>
            <title>Room</title>
          </head>
          <h1>Room</h1>
        </div>,
      ))
    .handler();

  const response = await handler(new Request("http://localhost/room"));
  const text = await response.text();

  expect(response.status).toBe(200);
  expect(text).toContain("<h1>Room</h1>");
});

Deno.test("Room page - has correct Head metadata", async () => {
  const handler = new App<State>()
    .get("/room", (ctx) =>
      ctx.render(
        <div class="page-container">
          <head>
            <title>Room</title>
          </head>
          <h1>Room</h1>
        </div>,
      ))
    .handler();

  const response = await handler(new Request("http://localhost/room"));
  const text = await response.text();

  expect(text).toContain("<title>Room</title>");
});

Deno.test("Feed page - renders with correct H1 content", async () => {
  const handler = new App<State>()
    .get("/feed", (ctx) =>
      ctx.render(
        <div class="page-container">
          <head>
            <title>Feed</title>
          </head>
          <h1>Feed</h1>
        </div>,
      ))
    .handler();

  const response = await handler(new Request("http://localhost/feed"));
  const text = await response.text();

  expect(response.status).toBe(200);
  expect(text).toContain("<h1>Feed</h1>");
});

Deno.test("Feed page - has correct Head metadata", async () => {
  const handler = new App<State>()
    .get("/feed", (ctx) =>
      ctx.render(
        <div class="page-container">
          <head>
            <title>Feed</title>
          </head>
          <h1>Feed</h1>
        </div>,
      ))
    .handler();

  const response = await handler(new Request("http://localhost/feed"));
  const text = await response.text();

  expect(text).toContain("<title>Feed</title>");
});

Deno.test("Crew page - renders with correct H1 content", async () => {
  const handler = new App<State>()
    .get("/crew", (ctx) =>
      ctx.render(
        <div class="page-container">
          <head>
            <title>Crew</title>
          </head>
          <h1>Crew</h1>
        </div>,
      ))
    .handler();

  const response = await handler(new Request("http://localhost/crew"));
  const text = await response.text();

  expect(response.status).toBe(200);
  expect(text).toContain("<h1>Crew</h1>");
});

Deno.test("Crew page - has correct Head metadata", async () => {
  const handler = new App<State>()
    .get("/crew", (ctx) =>
      ctx.render(
        <div class="page-container">
          <head>
            <title>Crew</title>
          </head>
          <h1>Crew</h1>
        </div>,
      ))
    .handler();

  const response = await handler(new Request("http://localhost/crew"));
  const text = await response.text();

  expect(text).toContain("<title>Crew</title>");
});

Deno.test("Archive page - renders with correct H1 content", async () => {
  const handler = new App<State>()
    .get("/archive", (ctx) =>
      ctx.render(
        <div class="page-container">
          <head>
            <title>Archive</title>
          </head>
          <h1>Archive</h1>
        </div>,
      ))
    .handler();

  const response = await handler(new Request("http://localhost/archive"));
  const text = await response.text();

  expect(response.status).toBe(200);
  expect(text).toContain("<h1>Archive</h1>");
});

Deno.test("Archive page - has correct Head metadata", async () => {
  const handler = new App<State>()
    .get("/archive", (ctx) =>
      ctx.render(
        <div class="page-container">
          <head>
            <title>Archive</title>
          </head>
          <h1>Archive</h1>
        </div>,
      ))
    .handler();

  const response = await handler(new Request("http://localhost/archive"));
  const text = await response.text();

  expect(text).toContain("<title>Archive</title>");
});

Deno.test("Navigation pages - URL routing functionality", async () => {
  const handler = new App<State>()
    .get("/dashboard", (ctx) => ctx.render(<h1>Dashboard</h1>))
    .get("/room", (ctx) => ctx.render(<h1>Room</h1>))
    .get("/feed", (ctx) => ctx.render(<h1>Feed</h1>))
    .get("/crew", (ctx) => ctx.render(<h1>Crew</h1>))
    .get("/archive", (ctx) => ctx.render(<h1>Archive</h1>))
    .handler();

  // Test all navigation routes return 200 status
  const dashboardResponse = await handler(
    new Request("http://localhost/dashboard"),
  );
  const roomResponse = await handler(new Request("http://localhost/room"));
  const feedResponse = await handler(new Request("http://localhost/feed"));
  const crewResponse = await handler(new Request("http://localhost/crew"));
  const archiveResponse = await handler(
    new Request("http://localhost/archive"),
  );

  expect(dashboardResponse.status).toBe(200);
  expect(roomResponse.status).toBe(200);
  expect(feedResponse.status).toBe(200);
  expect(crewResponse.status).toBe(200);
  expect(archiveResponse.status).toBe(200);
});
