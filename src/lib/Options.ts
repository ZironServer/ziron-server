/*
Author: Ing. Luca Gian Scaringella
GitHub: LucaCode
Copyright(c) Ing. Luca Gian Scaringella
 */

import Socket from "./Socket";

export interface SkipGroupMemberOption {
    /**
     * @description
     * Sets a group member that should not get the group transmit.
     * Notice when using this option, batching is not supported,
     * and the batch option will be ignored.
     */
    skipMember?: Socket;
}
