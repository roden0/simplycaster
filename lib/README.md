# SimplyCaster Copy System

This directory contains the centralized copy management system for SimplyCaster, allowing for easy text updates and potential internationalization.

## Files

- `copy.json` - Contains all text content organized by feature/page
- `copy.ts` - Utility functions for accessing copy content

## Usage

### Basic Usage

```typescript
import { getCopy } from "../lib/copy.ts";

// Get simple text
const title = getCopy("room.title"); // "Recording Room"

// Get text with interpolation
const participantCount = getCopy("room.participantCount", { count: "5" }); // "5 participants"
```

### Advanced Usage

```typescript
import { getCopySection, useCopy } from "../lib/copy.ts";

// Get entire section
const roomCopy = getCopySection("room");

// Use in components
function MyComponent() {
  const { t } = useCopy();
  
  return (
    <div>
      <h1>{t("room.title")}</h1>
      <p>{t("room.participantCount", { count: participants.length.toString() })}</p>
    </div>
  );
}
```

## Copy Structure

The copy is organized hierarchically:

```json
{
  "app": {
    "name": "SimplyCaster",
    "tagline": "Professional podcast recording made simple"
  },
  "room": {
    "title": "Recording Room",
    "participantCount": "{{count}} participants"
  }
}
```

## Interpolation

Use `{{variable}}` syntax for dynamic content:

```typescript
// In copy.json
"welcome": "Welcome back, {{name}}!"

// In code
getCopy("welcome", { name: "Alice" }); // "Welcome back, Alice!"
```

## Adding New Copy

1. Add the text to `copy.json` in the appropriate section
2. Use `getCopy("path.to.text")` in your component
3. For new sections, consider adding convenience exports in `copy.ts`

## Best Practices

1. **Organize by feature**: Group related text under feature sections (room, archive, feed, etc.)
2. **Use descriptive keys**: Make keys self-documenting (`searchRecordings` not `search1`)
3. **Consistent naming**: Use camelCase for keys
4. **Interpolation**: Use variables for dynamic content instead of string concatenation
5. **Fallbacks**: The system returns the key path if text is not found, making missing copy obvious

## Example Migration

Before:
```typescript
<h1>Recording Archive</h1>
<p>Manage and download your room recordings</p>
```

After:
```typescript
import { getCopy } from "../lib/copy.ts";

<h1>{getCopy("archive.title")}</h1>
<p>{getCopy("archive.subtitle")}</p>
```

## Future Enhancements

- **Internationalization**: Easy to extend for multiple languages
- **A/B Testing**: Swap copy variants for testing
- **Dynamic Loading**: Load copy from API for real-time updates
- **Validation**: Ensure all copy keys are used and no orphaned text exists