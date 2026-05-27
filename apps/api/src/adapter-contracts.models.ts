import {
  ADAPTER_CONTRACT_FOUNDATION,
  ADAPTER_CONTRACT_ROADMAP,
  ADAPTER_CONTRACT_STATUSES,
  ADAPTER_OPERATION_MODES,
} from './adapter-contracts.constants';

export type AdapterContractStatus = (typeof ADAPTER_CONTRACT_STATUSES)[number];
export type AdapterOperationMode = (typeof ADAPTER_OPERATION_MODES)[number];

export type AdapterContractRecord = (typeof ADAPTER_CONTRACT_FOUNDATION)[number];

export interface AdapterContractRegistryResponse {
  statuses: typeof ADAPTER_CONTRACT_STATUSES;
  operationModes: typeof ADAPTER_OPERATION_MODES;
  adapterContracts: readonly AdapterContractRecord[];
  next: typeof ADAPTER_CONTRACT_ROADMAP;
}
