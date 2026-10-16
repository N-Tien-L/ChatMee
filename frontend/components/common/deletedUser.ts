/** Label the backend sends for a user that no longer exists (SPEC-009 AC-009-28). */
export const DELETED_USER = "Deleted user";

export const isDeletedUser = (name: string | null | undefined): boolean =>
  name === DELETED_USER;
