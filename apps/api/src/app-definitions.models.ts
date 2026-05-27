import {
  APP_DEFINITION_FOUNDATION,
  APP_DEFINITION_ROADMAP,
  APP_DEFINITION_ROLES,
  APP_DEFINITION_STATUS,
} from './app-definitions.constants';

export type AppDefinitionRole = (typeof APP_DEFINITION_ROLES)[number];
export type AppDefinitionStatus = (typeof APP_DEFINITION_STATUS)[number];

export type AppDefinitionRecord = (typeof APP_DEFINITION_FOUNDATION)[number];

export interface AppDefinitionRegistryResponse {
  roles: typeof APP_DEFINITION_ROLES;
  statuses: typeof APP_DEFINITION_STATUS;
  appDefinitions: readonly AppDefinitionRecord[];
  next: typeof APP_DEFINITION_ROADMAP;
}
