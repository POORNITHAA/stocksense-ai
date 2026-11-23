import { auth } from './firebase';

export async function authorizedPost<TResponse>(
  url: string,
  body: Record<string, unknown>
): Promise<TResponse> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('You must be signed in to perform this action.');
  }
  const idToken = await user.getIdToken();

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof payload?.error === 'string'
        ? payload.error
        : `Request failed with status ${response.status}`
    );
  }
  return payload as TResponse;
}
