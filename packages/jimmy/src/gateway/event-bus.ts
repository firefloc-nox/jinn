/**
 * Gateway internal event bus — used for internal pub/sub between gateway modules.
 * Distinct from the WebSocket broadcast (apiContext.emit).
 */
import EventEmitter from 'node:events';

export const gatewayEventBus = new EventEmitter();
// Increase max listeners to avoid warnings when many workflows are registered
gatewayEventBus.setMaxListeners(100);
