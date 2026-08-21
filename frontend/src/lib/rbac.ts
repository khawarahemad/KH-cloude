import { useMemo, useState, useEffect } from 'react';
import { useAppStore } from './store';
import { apiRequest } from './api';

export type TeamRole = 'OWNER' | 'ADMIN' | 'DEVELOPER' | 'VIEWER';

const ROLE_WEIGHT: Record<TeamRole, number> = {
  OWNER: 4,
  ADMIN: 3,
  DEVELOPER: 2,
  VIEWER: 1,
};

export interface TeamRoleContext {
  role: TeamRole;
  isPlatformAdmin: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  isDeveloper: boolean;
  isViewer: boolean;
  canDeploy: boolean;
  canDelete: boolean;
  canWrite: boolean;
  canManageTeam: boolean;
  canManageBilling: boolean;
  loadingRole: boolean;
}

export function useTeamRole(): TeamRoleContext {
  const { user, activeTeam } = useAppStore();
  const [fetchedRole, setFetchedRole] = useState<TeamRole | null>(null);
  const [loadingRole, setLoadingRole] = useState(false);

  useEffect(() => {
    if (!activeTeam?.id || !user?.id) {
      setFetchedRole(null);
      return;
    }

    // Check if role is directly available on activeTeam
    if (activeTeam.role) {
      setFetchedRole(activeTeam.role as TeamRole);
      return;
    }

    // Check if members array is already embedded on activeTeam
    if (Array.isArray(activeTeam.members)) {
      const match = activeTeam.members.find(
        (m: any) => m.userId === user.id || m.user?.email === user.email,
      );
      if (match?.role) {
        setFetchedRole(match.role as TeamRole);
        return;
      }
    }

    // Otherwise fetch members to resolve current user's role
    let isMounted = true;
    setLoadingRole(true);
    apiRequest(`/teams/${activeTeam.id}/members`)
      .then((members: any[]) => {
        if (!isMounted) return;
        if (Array.isArray(members)) {
          const match = members.find(
            (m: any) => m.userId === user.id || m.user?.email === user.email,
          );
          if (match?.role) {
            setFetchedRole(match.role as TeamRole);
          } else {
            setFetchedRole('VIEWER');
          }
        }
      })
      .catch(() => {
        if (isMounted) setFetchedRole('VIEWER');
      })
      .finally(() => {
        if (isMounted) setLoadingRole(false);
      });

    return () => {
      isMounted = false;
    };
  }, [activeTeam?.id, user?.id, user?.email]);

  return useMemo(() => {
    const isPlatformAdmin = user?.role === 'ADMIN';

    if (isPlatformAdmin) {
      return {
        role: 'OWNER',
        isPlatformAdmin: true,
        isOwner: true,
        isAdmin: true,
        isDeveloper: true,
        isViewer: true,
        canDeploy: true,
        canDelete: true,
        canWrite: true,
        canManageTeam: true,
        canManageBilling: true,
        loadingRole,
      };
    }

    const currentRole: TeamRole = fetchedRole || 'VIEWER';
    const weight = ROLE_WEIGHT[currentRole] || 1;

    return {
      role: currentRole,
      isPlatformAdmin: false,
      isOwner: weight >= ROLE_WEIGHT.OWNER,
      isAdmin: weight >= ROLE_WEIGHT.ADMIN,
      isDeveloper: weight >= ROLE_WEIGHT.DEVELOPER,
      isViewer: true,
      canDeploy: weight >= ROLE_WEIGHT.DEVELOPER,
      canDelete: weight >= ROLE_WEIGHT.ADMIN,
      canWrite: weight >= ROLE_WEIGHT.DEVELOPER,
      canManageTeam: weight >= ROLE_WEIGHT.ADMIN,
      canManageBilling: weight >= ROLE_WEIGHT.OWNER,
      loadingRole,
    };
  }, [user?.role, fetchedRole, loadingRole]);
}
