export const buildEventDiscussionsPath = (eventIdentifier: string) => {
  return `/event/${eventIdentifier}/discussions`;
};

export const buildEventPostDiscussionsPath = (eventIdentifier: string, postId: string) => {
  const params = new URLSearchParams({ post: postId });
  return `${buildEventDiscussionsPath(eventIdentifier)}?${params.toString()}`;
};

export const buildEventPostDiscussionsUrl = (eventIdentifier: string, postId: string) => {
  return `${window.location.origin}${buildEventPostDiscussionsPath(eventIdentifier, postId)}`;
};

