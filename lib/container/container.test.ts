/**
 * Container Tests
 * 
 * Tests for the dependency injection container functionality
 */

import { assertEquals, assertThrows } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { Container } from './container.ts';

// Test interfaces
interface TestService {
    getValue(): string;
}

class TestServiceImpl implements TestService {
    constructor(private value: string) { }

    getValue(): string {
        return this.value;
    }
}

Deno.test("Container - basic registration and resolution", () => {
    const container = new Container();

    // Register a service
    container.register<TestService>('testService', () => new TestServiceImpl('test-value'));

    // Resolve the service
    const service = container.get<TestService>('testService');

    assertEquals(service.getValue(), 'test-value');
});

Deno.test("Container - singleton pattern", () => {
    const container = new Container();

    // Register a service
    container.register<TestService>('testService', () => new TestServiceImpl('singleton-test'));

    // Get the service twice
    const service1 = container.get<TestService>('testService');
    const service2 = container.get<TestService>('testService');

    // Should be the same instance
    assertEquals(service1, service2);
});

Deno.test("Container - service not found error", () => {
    const container = new Container();

    // Try to get a service that doesn't exist
    assertThrows(
        () => container.get('nonExistentService'),
        Error,
        'Service nonExistentService not registered'
    );
});

Deno.test("Container - duplicate registration error", () => {
    const container = new Container();

    // Register a service
    container.register('testService', () => new TestServiceImpl('test'));

    // Try to register the same service again
    assertThrows(
        () => container.register('testService', () => new TestServiceImpl('test2')),
        Error,
        'Service testService is already registered'
    );
});

Deno.test("Container - has method", () => {
    const container = new Container();

    // Initially should not have the service
    assertEquals(container.has('testService'), false);

    // Register the service
    container.register('testService', () => new TestServiceImpl('test'));

    // Now should have the service
    assertEquals(container.has('testService'), true);
});

Deno.test("Container - clear method", () => {
    const container = new Container();

    // Register a service
    container.register('testService', () => new TestServiceImpl('test'));

    // Verify it's registered
    assertEquals(container.has('testService'), true);

    // Clear the container
    container.clear();

    // Verify it's no longer registered
    assertEquals(container.has('testService'), false);
});

Deno.test("Container - getRegisteredKeys method", () => {
    const container = new Container();

    // Initially should have no keys
    assertEquals(container.getRegisteredKeys(), []);

    // Register some services
    container.register('service1', () => new TestServiceImpl('test1'));
    container.register('service2', () => new TestServiceImpl('test2'));

    // Should have both keys
    const keys = container.getRegisteredKeys();
    assertEquals(keys.length, 2);
    assertEquals(keys.includes('service1'), true);
    assertEquals(keys.includes('service2'), true);
});