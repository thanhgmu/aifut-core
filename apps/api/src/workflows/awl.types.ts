/**
 * AWL — AIFUT Workflow Language v0.1
 *
 * An AWL document describes a business workflow as a sequence of steps.
 * It is designed to be human-readable, AI-generatable, and executable.
 *
 * Format: YAML-in-JSON (stored as JSON in DB, displayed as YAML to users)
 */

export const AWL_VERSION = '0.1';

export interface AwlDocument {
  awl: string;           // '0.1'
  workflow: string;      // unique key
  name: string;
  description?: string;
  category?: string;
  industry?: string;
  version?: string;
  trigger?: AwlTrigger;
  steps: AwlStep[];
}

export interface AwlTrigger {
  kind: 'schedule' | 'webhook' | 'event' | 'manual';
  config?: Record<string, any>;  // cron expression, event type, etc.
}

export interface AwlStep {
  id: string;            // unique step identifier
  name: string;
  type: 'action' | 'send' | 'condition' | 'wait' | 'transform' | 'loop' | 'subflow';
  config?: Record<string, any>;
  depends_on?: string[];  // step IDs this step depends on
  retry?: { max?: number; delay?: number };
  timeout?: number;       // seconds
}

/**
 * AWL examples (used for templates and AI prompting):
 *
 * ::order-confirmation::
 * awl: 0.1
 * workflow: order-confirm
 * name: Xác nhận đơn hàng
 * trigger:
 *   kind: event
 *   config: { event: "order.created" }
 * steps:
 *   - id: send-zalo
 *     name: Gửi Zalo xác nhận
 *     type: send
 *     config:
 *       channel: zalo
 *       template: order_confirm_vi
 *       to: "{{order.customer.phone}}"
 *   - id: wait-2h
 *     name: Chờ 2 tiếng
 *     type: wait
 *     config:
 *       seconds: 7200
 *     depends_on: [send-zalo]
 *   - id: check-review
 *     name: Kiểm tra đánh giá
 *     type: condition
 *     config:
 *       field: "order.status"
 *       equals: "delivered"
 *     depends_on: [wait-2h]
 *   - id: ask-review
 *     name: Gửi yêu cầu đánh giá
 *     type: send
 *     config:
 *       channel: zalo
 *       template: review_request_vi
 *     depends_on: [check-review]
 */
