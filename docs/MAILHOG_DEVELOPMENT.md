# MailHog Development Setup

MailHog is integrated into the development environment to capture and display emails sent by SimplyCaster during development and testing.

## Overview

MailHog provides:
- SMTP server on port 1025 for capturing emails
- Web UI on port 8025 for viewing captured emails
- No authentication required for development
- Persistent email storage in development

## Configuration

The following environment variables are automatically configured in development:

```bash
EMAIL_PROVIDER=mailhog
EMAIL_SMTP_HOST=mailhog
EMAIL_SMTP_PORT=1025
EMAIL_FROM_ADDRESS=noreply@simplycast.local
EMAIL_FROM_NAME=SimplyCaster Development
EMAIL_QUEUE_ENABLED=true
EMAIL_QUEUE_CONCURRENCY=5
EMAIL_RETRY_ATTEMPTS=3
EMAIL_RETRY_DELAY=5000
```

## Usage

### Starting MailHog

MailHog starts automatically when you run the development environment:

```bash
docker-compose up -d
```

### Accessing the Web UI

Open your browser and navigate to:
- **Web UI**: http://localhost:8025

### Viewing Emails

1. Navigate to http://localhost:8025
2. All emails sent by the application will appear in the inbox
3. Click on any email to view its content (HTML and text versions)
4. Use the search functionality to find specific emails

### API Access

MailHog also provides a REST API for programmatic access:
- **API Base URL**: http://localhost:8025/api/v1/
- **Messages endpoint**: http://localhost:8025/api/v1/messages

### Data Persistence

Email data is persisted in the `mailhog_data` Docker volume, so emails will remain available between container restarts.

### Clearing Emails

To clear all captured emails:
1. Use the "Delete all messages" button in the web UI, or
2. Restart the MailHog container: `docker-compose restart mailhog`

## Health Check

MailHog includes a health check that verifies the web UI is accessible. You can check the status with:

```bash
docker-compose ps mailhog
```

## Troubleshooting

### MailHog not receiving emails
- Verify the app service can reach the mailhog service: `docker-compose exec app ping mailhog`
- Check that EMAIL_SMTP_HOST is set to 'mailhog' and EMAIL_SMTP_PORT is '1025'
- Ensure the email service is configured to use the MailHog provider

### Web UI not accessible
- Verify port 8025 is not in use by another service
- Check MailHog container logs: `docker-compose logs mailhog`
- Ensure the container is running: `docker-compose ps mailhog`

### Emails not persisting
- Check that the mailhog_data volume is properly mounted
- Verify MH_STORAGE is set to 'maildir' in the container environment