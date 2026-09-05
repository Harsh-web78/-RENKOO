export type MemberRoleName = 'OWNER' | 'ADMIN' | 'MEMBER';

export interface AuthenticatedRequestUser {
  userId: string;
  email: string;
  organizationId: string;
  role: MemberRoleName;
}
