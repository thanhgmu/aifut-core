export interface RequestContextUser {
  id: string;
  email: string;
  name: string | null;
}

export interface RequestContextTenant {
  id: string;
  name: string;
  slug: string;
}

export interface RequestContextMembership {
  id: string;
  role: string;
  userId: string;
  tenantId: string;
}

export interface RequestContext {
  user: RequestContextUser | null;
  tenant: RequestContextTenant | null;
  membership: RequestContextMembership | null;
}
