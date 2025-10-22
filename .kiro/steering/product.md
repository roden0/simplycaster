# Product Overview

SimplyCaster is a podcast/conversation recording platform focused on simplicity,
audio quality, and deployment on private servers (self-hosted Saas).

## Key Features

- **Server-Side Rendering (SSR)**: Pages are rendered on the server for optimal
  performance and SEO
- **Islands Architecture**: Interactive components are hydrated on the
  client-side only where needed
- **Dark/Light Theme**: Built-in theme toggle with system preference detection
  and localStorage persistence
- **Responsive Design**: Mobile-first responsive layout using Tailwind CSS
- **Authentication**: Login functionality with form-based authentication

## UX/UI considerations

### Design principles

- **Minimalist**: Simple, clean, and intuitive design
- **Functional**: Easy to use and intuitive
- **Accessibility**: Follows WCAG 2.0 guidelines. Has ARIA labels and keyboard
  navigation
- **Performance**: Optimized for speed and responsiveness
- **Mobile-first**: Responsive design for mobile devices
- **Dark/Light Theme**: Follows system preference and localStorage persistence

## Advanced Features

- **Audio Recording and Video monitoring**: WebRTC with Mediasoup for P2P
  communication
- **Audio Processing**: Local first FFMpeg with WebAssembly for audio processing
- **Podcast Generation**: Automatic podcast generation from recorded audio
- **Deployment**: Self-hosted Saas with Docker and Kubernetes

## Security Model

### Authentication and Authorization

- OAuth2 with JWT PKCE for authentication
- Rate limiting to prevent abuse
- Secure communication with HTTPS
- Role based access control
  - Admin: Full access to all features
  - Host: Manages Rooms and their recordings
  - Guest: Temporary access via magic links

### Data Security

- Temporary tokent with automatic expiration
- Route sanitisation to prevent path traversal
- Rate limiting on critical endpoints to prevent abuse
- Data is stored in server storage
- Data is stored in a PostgreSQL database
  - One data base for Business Models and other one for authentication

## Functional Modules

### Room management

A host creates a room. Then a room is served with its unique URL. The host then
invites guests, the guests access the room. The host should rename the room, if
not, room name is the current room creation date. The host can start recording
and stop recording. Guests can only join the room if they have a magic link. The
guest can leave the room, then the token is expired. The host can kick a guest
out of the room, then the token is expired. The start of a recording starts a
local-first audio recording. When the host stops recording, the recording is
uploaded to the server already processed by local FFMPEG Wasm module. When the
host leaves the room, the recording stops, the room is destroyed but the
recordings are kept in the archive.

### Recording engine

MediaRecorder API is used to record audio and video. The audio is processed by a
local-first FFMPEG Wasm module. The video is not processed. The audio recording
is uploaded to the server. IndexedDB is used for temporary chunk buffering. The
audio recording is stored in the database. FFmpeg.wasm: Processing and
optimisation pre-upload. Resumable uploads for unstable connections. If the
guest leaves the room, the recording is uploaded to the server.

### Archive system

The recordings are stored in the server storage. The folders are the rooms
names. The recording files are a combination of the room name and the guest
name. A metadata JSON file is added to the folder. Admin and Hosts can delete
recordings from the archive. Hosts can only delete their own recordings.

### Feed generation

Host and Admin can upload files to the feed. The files will be mp3, ogg, or
webm, and ID3 tags will be parsed. The feed is served as a standard RSS feed.
The feed will be cached and will have proper CDN ETags and Cache-Control
headers. Admin and Hosts can delete recordings from the feed.

### Crew management

Admin will handle Hosts CRUD. Admin will handle Admin CRUD. Admin and Host can
invite guests to created rooms. Admin and Host can revoke temporary tokens for
guests. Audit log of administrative actions will be stored in the database.

## Main views

### Sign In page

The page contains a form with email and password fields. The form is validated
with HTML5 and JavaScript. The form is submitted to the server with a POST
request. The server validates the form with OAuth flow and returns a JWT token.
The token is stored in localStorage and the user is redirected to the Dashboard
page.

### Dashboard page

The page shows the big numbers of rooms created, recordings and latest session
(guests, total time...) summary. Also displays the button to create a room or
navigate to the Archive, the Feed, and the Crew pages.

### Room page

The page is divided in three big sections. The top bar has controls to start and
stop the recordings, also an Invite and Leave buttons. The main section has a
mosaic of the video signal of every participant. Each box has the name and kick
button. The bottom has a big counter of the total time of the recording and a
red 'Recording' sign if the recording is running.

### Archive Page

The page is a searchable list of room recordings. Each list item has a name,
date, and a delete button. The page is paginated and can be sorted by name or
date. When we select a room recording, the page will show the recording details
in a sidebar, a button to download or delete each separate recording.

### Feed Page

The page is a searchable list of uploaded files. Each list item has a name,
date, and a delete button. The page is paginated and can be sorted by name or
date. At the top of the list we have a upload form to upload a file. A dialog
pops with a form. The form has a file input, a name input, a description input,
and a submit button. The form is validated with HTML5 and JavaScript. The form
is submitted to the server with a POST request. The server validates the form
and returns a JSON response then the list is updated. The file is stored in the
server storage.

### Crew Page

The page is a searchable list of crew members. Each list item has a name, email,
revoke button if is a guest, and a delete button. The page is paginated and can
be sorted by name or email. At the top of the list we have a invite button to
invite a guest to a room. A dialog pops with a form. The form has a current
active rooms select input, an email input, and a submit button. The form is
validated with HTML5 and JavaScript. The form is submitted to the server with a
POST request. The server validates the form and returns a JSON response then the
list is updated. Token is generated, and the invite is sent to the email. At the
top of the list we have a 'create host' button to create a new host. A dialog
pops with a form. The form has an email input, and a submit button. The form is
validated with HTML5 and JavaScript. The form is submitted to the server with a
POST request. The server validates the form and returns a JSON the list is not
updated until the host confirms the email and finishes the register process.

### Invite Landing Page

The page is a landing page for the invited guests. When the Token is sent to the
email, the user is redirected to this page with a signed token as a url param which is validated by the back-end.
The page shows a message to the user
to wait for the host to accept the invitation. When the host accepts, guest is
redirected to the corresponding room.

### Host creation Landing Page

When the host receives the email, the host is redirected to this page with a signed token as a url param which is validated by the back-end.
The page shows a form to create a password. The form has a name input, a password input,
a confirm password input, and a submit button. The form is validated with HTML5
and JavaScript. The form is submitted to the server with a POST request. The
server validates the form and returns a JSON response then the user is
redirected to the Dashboard page.
