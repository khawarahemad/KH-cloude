import { NetworkResource, Project, ProjectNetwork } from '@prisma/client';

export interface ProxyConnectionInfo {
  protocol: string;
  address: string;
  port: number;
  transport: string;
  path: string;
  security: string;
  uri: string;
}

export interface ProxyReconciliationContext {
  resource: NetworkResource;
  canonicalDomain: string;
}

export interface ProxyDriver {
  /**
   * Provisions or updates the proxy infrastructure.
   */
  reconcile(context: ProxyReconciliationContext): Promise<void>;

  /**
   * Completely removes the proxy infrastructure and configuration.
   */
  remove(resource: NetworkResource): Promise<void>;

  /**
   * Retrieves strictly typed connection information.
   * Returns null if the resource is not ready or missing credentials.
   */
  getConnectionInfo(context: ProxyReconciliationContext): ProxyConnectionInfo | null;

  /**
   * Performs a runtime health check against the proxy container/process.
   */
  healthCheck(resource: NetworkResource): Promise<boolean>;
}
