/** Explicit internal markers; ordinary names such as Temple and contest remain public. */
export const LIBRARY_INTERNAL_NAME = /(^|[\s_(<\[])(dnt|ph|test|testing|unused|deprecated|internal|zzold|delete|dummy|nyi)([\s_)>\]:-]|$)|^Ping(\s|$)|Personal Best Record|^zz/i;
