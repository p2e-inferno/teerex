export type ProfileTab = 'events' | 'created' | 'collected';

export function profilePath(address: string, tab: ProfileTab = 'events'): string {
  return `/u/${address.toLowerCase()}?tab=${tab}`;
}

export function profileShareUrl(address: string, tab: ProfileTab = 'events'): string {
  return `${window.location.origin}${profilePath(address, tab)}`;
}

export function collectibleShareUrl(collectibleId: string): string {
  return `${window.location.origin}/collectible/${collectibleId}`;
}
