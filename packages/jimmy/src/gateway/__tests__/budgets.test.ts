import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { BudgetConfig } from '../../shared/types.js';

// Mock the database
vi.mock('../../sessions/registry.js', () => ({
  initDb: vi.fn(() => ({
    prepare: vi.fn(() => ({
      get: vi.fn(() => ({ spend: 0 })),
      run: vi.fn(),
      all: vi.fn(() => []),
    })),
  })),
  getSession: vi.fn(),
}));

// Mock the logger
vi.mock('../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock the callbacks
vi.mock('../../sessions/callbacks.js', () => ({
  notifyBudgetAlert: vi.fn(),
}));

// Mock the event bus
vi.mock('../event-bus.js', () => ({
  gatewayEventBus: {
    emit: vi.fn(),
    on: vi.fn(),
  },
}));

describe('budgets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getBudgetStatusFromConfig', () => {
    it('should return ok status when no threshold is set', async () => {
      const { getBudgetStatusFromConfig } = await import('../budgets.js');
      const config: BudgetConfig = { threshold: 0 };
      const result = getBudgetStatusFromConfig('test-employee', config);
      
      expect(result.status).toBe('ok');
      expect(result.spend).toBe(0);
      expect(result.limit).toBe(0);
    });

    it('should calculate correct percent', async () => {
      const { initDb } = await import('../../sessions/registry.js');
      const mockDb = {
        prepare: vi.fn(() => ({
          get: vi.fn(() => ({ spend: 50 })),
          run: vi.fn(),
        })),
      };
      (initDb as any).mockReturnValue(mockDb);

      const { getBudgetStatusFromConfig } = await import('../budgets.js');
      const config: BudgetConfig = { threshold: 100 };
      const result = getBudgetStatusFromConfig('test-employee', config);
      
      expect(result.percent).toBe(50);
    });
  });

  describe('checkBudgetThreshold', () => {
    it('should emit budget:exceeded event when threshold is exceeded', async () => {
      const { initDb } = await import('../../sessions/registry.js');
      const mockDb = {
        prepare: vi.fn(() => ({
          get: vi.fn(() => ({ spend: 150 })),
          run: vi.fn(),
        })),
      };
      (initDb as any).mockReturnValue(mockDb);

      const { checkBudgetThreshold } = await import('../budgets.js');
      const { gatewayEventBus } = await import('../event-bus.js');
      const { notifyBudgetAlert } = await import('../../sessions/callbacks.js');

      const config: BudgetConfig = { 
        threshold: 100, 
        alertConnector: 'discord',
        alertChannel: '123456' 
      };
      
      checkBudgetThreshold('test-employee', config, 'session-123', 'engineering');

      expect(gatewayEventBus.emit).toHaveBeenCalledWith('budget:exceeded', expect.objectContaining({
        employee: 'test-employee',
        department: 'engineering',
        spend: 150,
        threshold: 100,
        alertConnector: 'discord',
        alertChannel: '123456',
      }));

      expect(notifyBudgetAlert).toHaveBeenCalledWith(
        'test-employee',
        150,
        100,
        150,
        'discord',
        '123456',
        'exceeded'
      );
    });

    it('should emit budget:warning event at 80% threshold', async () => {
      const { initDb } = await import('../../sessions/registry.js');
      const mockDb = {
        prepare: vi.fn(() => ({
          get: vi.fn(() => ({ spend: 85 })),
          run: vi.fn(),
        })),
      };
      (initDb as any).mockReturnValue(mockDb);

      // Re-import to get fresh module with new mock
      vi.resetModules();
      const budgets = await import('../budgets.js');
      const { gatewayEventBus } = await import('../event-bus.js');

      const config: BudgetConfig = { threshold: 100 };
      budgets.checkBudgetThreshold('test-employee', config);

      expect(gatewayEventBus.emit).toHaveBeenCalledWith('budget:warning', expect.objectContaining({
        employee: 'test-employee',
        percent: 85,
      }));
    });
  });

  describe('BudgetConfig type', () => {
    it('should accept valid budget config', () => {
      const config: BudgetConfig = {
        threshold: 100,
        alertConnector: 'discord',
        alertChannel: '123456789',
      };
      
      expect(config.threshold).toBe(100);
      expect(config.alertConnector).toBe('discord');
      expect(config.alertChannel).toBe('123456789');
    });

    it('should accept minimal budget config', () => {
      const config: BudgetConfig = {
        threshold: 50,
      };
      
      expect(config.threshold).toBe(50);
      expect(config.alertConnector).toBeUndefined();
      expect(config.alertChannel).toBeUndefined();
    });
  });
});
