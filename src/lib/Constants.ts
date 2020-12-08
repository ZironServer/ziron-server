/*
Author: Luca Scaringella
GitHub: LucaCode
Copyright(c) Luca Scaringella
 */

export const EMPTY_FUNCTION = () => {};
export const NOT_OPEN_FAILURE_FUNCTION = () => {
    throw new Error('Socket is not open');
}