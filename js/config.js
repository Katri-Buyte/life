// Database connection (Supabase).
// Leave both empty to keep everything on this device only.
// The key below is the publishable key, which is meant to be public: the row level security rules in
// supabase/schema.sql are what keep the data private to the signed-in user.
export const SUPABASE_URL = 'https://fyiecypkubgxtdijuuwx.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_SJQF-Vi3NuZNqZ5azoglJA_U8szXXWb';

// Where the Recipes tab reads its content from. Empty means this app's own
// data/recipes.json, data/plans.json and images/ folder.
export const RECIPES_BASE = '';
