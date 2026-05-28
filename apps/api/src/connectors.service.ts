import { Injectable } from '@nestjs/common';
import {
  ADAPTER_CONTRACT_FOUNDATION,
  ADAPTER_CONTRACT_ROADMAP,
  ADAPTER_CONTRACT_STATUSES,
  ADAPTER_OPERATION_MODES,
} from './adapter-contracts.constants';
import {
  ADAPTER_INTERFACE_FOUNDATION,
  ADAPTER_INTERFACE_ROADMAP,
  ADAPTER_INTERFACE_STATUSES,
} from './adapter-interface-definitions.constants';
import {
  APP_DEFINITION_FOUNDATION,
  APP_DEFINITION_ROADMAP,
  APP_DEFINITION_ROLES,
  APP_DEFINITION_STATUS,
} from './app-definitions.constants';
import {
  CONNECTOR_AUTH_MODES,
  CONNECTOR_CATEGORIES,
  CONNECTOR_REGISTRY_FOUNDATION,
  CONNECTOR_REGISTRY_ROADMAP,
  CONNECTOR_SYNC_DIRECTIONS,
} from './connectors.constants';

@Injectable()
export class ConnectorsService {
  listRegistry() {
    return {
      categories: CONNECTOR_CATEGORIES,
      authModes: CONNECTOR_AUTH_MODES,
      syncDirections: CONNECTOR_SYNC_DIRECTIONS,
      connectors: CONNECTOR_REGISTRY_FOUNDATION,
      next: CONNECTOR_REGISTRY_ROADMAP,
    };
  }

  listAppDefinitions() {
    return {
      roles: APP_DEFINITION_ROLES,
      statuses: APP_DEFINITION_STATUS,
      appDefinitions: APP_DEFINITION_FOUNDATION,
      next: APP_DEFINITION_ROADMAP,
    };
  }

  listAdapterContracts() {
    return {
      statuses: ADAPTER_CONTRACT_STATUSES,
      operationModes: ADAPTER_OPERATION_MODES,
      adapterContracts: ADAPTER_CONTRACT_FOUNDATION,
      next: ADAPTER_CONTRACT_ROADMAP,
    };
  }

  listAdapterInterfaces() {
    return {
      statuses: ADAPTER_INTERFACE_STATUSES,
      adapterInterfaces: ADAPTER_INTERFACE_FOUNDATION,
      next: ADAPTER_INTERFACE_ROADMAP,
    };
  }

  listTemplates() {
    return {
      setupModes: ['template-first', 'ai-assisted', 'advanced'],
      templates: [
        {
          key: 'shopify-store-sync',
          title: 'Connect Shopify store',
          connectorKey: 'shopify',
          targetUsers: 'non-technical-to-mixed',
          defaultSyncObjects: ['customers', 'orders', 'products'],
        },
        {
          key: 'perfex-crm-sync',
          title: 'Connect Perfex CRM',
          connectorKey: 'perfex',
          targetUsers: 'operator-and-partner',
          defaultSyncObjects: ['customers', 'invoices', 'appointments'],
        },
        {
          key: 'moodle-campus-sync',
          title: 'Connect Moodle campus',
          connectorKey: 'moodle',
          targetUsers: 'mixed',
          defaultSyncObjects: ['courses', 'enrollments', 'progress'],
        },
        {
          key: 'n8n-workflow-bridge',
          title: 'Connect n8n workspace',
          connectorKey: 'n8n',
          targetUsers: 'mixed',
          defaultSyncObjects: ['workflow-events', 'automation-triggers'],
        },
        {
          key: 'generic-rest-system',
          title: 'Connect a custom system via REST/OAuth',
          connectorKey: 'generic-rest',
          targetUsers: 'technical-and-partner',
          defaultSyncObjects: ['custom-objects', 'events', 'actions'],
        },
      ],
      next: [
        'connection-verification-api',
        'mapping-policy-profiles',
        'wizard-driven-setup-state',
      ],
    };
  }
}
