/*
Author: Luca Scaringella
GitHub: LucaCode
Copyright(c) Luca Scaringella
 */

export type Writable<T> = { -readonly [P in keyof T]: T[P] };

export const distinctArrayFilter = <T>(v: T, i: number, a: T[]) => a.indexOf(v) === i;