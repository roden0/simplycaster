/**
 * Email Template Engine Tests
 */

import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { TemplateEngine } from './template-engine.ts';

Deno.test("TemplateEngine - Basic variable substitution", async () => {
  const engine = new TemplateEngine('lib/email/templates', false);
  
  const template = "Hello {{name}}, welcome to {{platform}}!";
  const variables = {
    name: "John Doe",
    platform: "SimplyCaster"
  };
  
  const result = engine['renderString'](template, variables);
  
  assertEquals(result.success, true);
  if (result.success) {
    assertEquals(result.data, "Hello John Doe, welcome to SimplyCaster!");
  }
});

Deno.test("TemplateEngine - Conditional blocks", async () => {
  const engine = new TemplateEngine('lib/email/templates', false);
  
  const template = "Hello {{name}}{{#email}} ({{email}}){{/email}}!";
  
  // Test with email
  const variablesWithEmail = {
    name: "John Doe",
    email: "john@example.com"
  };
  
  const resultWithEmail = engine['renderString'](template, variablesWithEmail);
  assertEquals(resultWithEmail.success, true);
  if (resultWithEmail.success) {
    assertEquals(resultWithEmail.data, "Hello John Doe (john@example.com)!");
  }
  
  // Test without email
  const variablesWithoutEmail = {
    name: "John Doe"
  };
  
  const resultWithoutEmail = engine['renderString'](template, variablesWithoutEmail);
  assertEquals(resultWithoutEmail.success, true);
  if (resultWithoutEmail.success) {
    assertEquals(resultWithoutEmail.data, "Hello John Doe!");
  }
});

Deno.test("TemplateEngine - Date formatting", async () => {
  const engine = new TemplateEngine('lib/email/templates', false);
  
  const template = "Expires on {{expiresAt}}";
  const variables = {
    expiresAt: new Date('2024-01-01T12:00:00Z')
  };
  
  const result = engine['renderString'](template, variables);
  
  assertEquals(result.success, true);
  if (result.success) {
    assertExists(result.data);
    // Just check that it contains the date parts
    assertEquals(result.data.includes('2024'), true);
  }
});

Deno.test("TemplateEngine - HTML escaping", async () => {
  const engine = new TemplateEngine('lib/email/templates', false);
  
  const template = "Message: {{message}}";
  const variables = {
    message: "<script>alert('xss')</script>"
  };
  
  const result = engine['renderString'](template, variables);
  
  assertEquals(result.success, true);
  if (result.success) {
    assertEquals(result.data, "Message: &lt;script&gt;alert(&#x27;xss&#x27;)&lt;/script&gt;");
  }
});

Deno.test("TemplateEngine - Load guest invitation template", async () => {
  const engine = new TemplateEngine('lib/email/templates', false);
  
  const result = await engine.loadTemplate('guest-invitation');
  
  assertEquals(result.success, true);
  if (result.success) {
    const template = result.data;
    assertEquals(template.config.id, 'guest-invitation');
    assertEquals(template.config.requiredVariables.includes('guestName'), true);
    assertEquals(template.config.requiredVariables.includes('hostName'), true);
    assertEquals(template.config.requiredVariables.includes('roomName'), true);
    assertExists(template.html);
    assertExists(template.text);
  }
});

Deno.test("TemplateEngine - Render guest invitation template", async () => {
  const engine = new TemplateEngine('lib/email/templates', false);
  
  const variables = {
    guestName: "Alice Smith",
    hostName: "Bob Johnson",
    roomName: "Weekly Podcast",
    joinUrl: "https://example.com/join/abc123",
    expiresAt: new Date('2024-12-31T23:59:59Z'),
    roomDescription: "Our weekly discussion about tech trends"
  };
  
  const result = await engine.renderTemplate('guest-invitation', variables);
  

  
  assertEquals(result.success, true);
  if (result.success) {
    const rendered = result.data;
    assertExists(rendered.subject);
    assertExists(rendered.html);
    assertExists(rendered.text);
    
    // Check that variables were substituted
    assertEquals(rendered.subject.includes('Weekly Podcast'), true);
    assertEquals(rendered.html!.includes('Alice Smith'), true);
    assertEquals(rendered.text!.includes('Bob Johnson'), true);
  }
});

Deno.test("TemplateEngine - List templates", async () => {
  const engine = new TemplateEngine('lib/email/templates', false);
  
  const result = await engine.listTemplates();
  
  assertEquals(result.success, true);
  if (result.success) {
    const templates = result.data;
    assertEquals(templates.includes('guest-invitation'), true);
    assertEquals(templates.includes('password-reset'), true);
    assertEquals(templates.includes('host-invitation'), true);
  }
});

Deno.test("TemplateEngine - Validate variables", async () => {
  const engine = new TemplateEngine('lib/email/templates', false);
  
  // Valid variables
  const validVariables = {
    guestName: "Alice Smith",
    hostName: "Bob Johnson",
    roomName: "Weekly Podcast",
    joinUrl: "https://example.com/join/abc123",
    expiresAt: new Date()
  };
  
  const validResult = await engine.validateVariables('guest-invitation', validVariables);
  assertEquals(validResult.success, true);
  
  // Missing required variable
  const invalidVariables = {
    guestName: "Alice Smith",
    hostName: "Bob Johnson"
    // Missing roomName, joinUrl, expiresAt
  };
  
  const invalidResult = await engine.validateVariables('guest-invitation', invalidVariables);
  assertEquals(invalidResult.success, false);
});