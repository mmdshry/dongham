import { normalizeEmail, normalizeIranMobile } from './normalize.js';

/** Fields used to decide whether a member row belongs to one cloud/guest actor. */
export type MemberMatchFields = {
  userId?: string;
  guestKey?: string;
  phone?: string;
  email?: string;
};

/**
 * Same matching the API uses for write access and settlement: userId, guest key,
 * then normalized phone or email. A cloud user can own several seats this way.
 */
export function memberBelongsToActor(
  member: MemberMatchFields | null | undefined,
  actor: MemberMatchFields | null | undefined,
): boolean {
  if (!member || !actor) return false;
  if (actor.userId && member.userId === actor.userId) return true;
  if (actor.guestKey && member.guestKey === actor.guestKey) return true;
  const actorPhone = normalizeIranMobile(actor.phone);
  const memberPhone = normalizeIranMobile(member.phone);
  if (actorPhone && memberPhone === actorPhone) return true;
  const actorEmail = normalizeEmail(actor.email);
  const memberEmail = normalizeEmail(member.email);
  return Boolean(actorEmail && memberEmail && actorEmail === memberEmail);
}

export function actorMemberIdsOf(
  members: readonly (MemberMatchFields & { id: string })[],
  actor: MemberMatchFields | null | undefined,
): string[] {
  if (!actor) return [];
  return members.filter((m) => memberBelongsToActor(m, actor)).map((m) => m.id);
}
