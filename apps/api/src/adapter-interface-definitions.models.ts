import {
  ADAPTER_INTERFACE_FOUNDATION,
  ADAPTER_INTERFACE_ROADMAP,
  ADAPTER_INTERFACE_STATUSES,
} from './adapter-interface-definitions.constants';

export type AdapterInterfaceStatus =
  (typeof ADAPTER_INTERFACE_STATUSES)[number];
export type AdapterInterfaceRecord =
  (typeof ADAPTER_INTERFACE_FOUNDATION)[number];

export interface AdapterInterfaceRegistryResponse {
  statuses: readonly AdapterInterfaceStatus[];
  adapterInterfaces: readonly AdapterInterfaceRecord[];
  next: typeof ADAPTER_INTERFACE_ROADMAP;
}
