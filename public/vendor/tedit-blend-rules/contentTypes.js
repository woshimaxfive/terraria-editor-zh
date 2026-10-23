// Dedicated framed paths in the pinned TEdit renderer. These IDs remain
// separate from the general framed list until their complete recipes run.
export const CONTENT_TEXTURE_IDS=Object.freeze([128,171,269,334,373,374,375,395,461,470,471,475,520,617,698,709,723,724,751,752]);
const supported=new Set(CONTENT_TEXTURE_IDS);
export const isContentTexture=id=>supported.has(id);
