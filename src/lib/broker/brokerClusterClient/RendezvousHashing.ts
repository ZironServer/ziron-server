/*
Author: Luca Scaringella
GitHub: LucaCode
Copyright(c) Luca Scaringella
 */

import crypto = require('crypto');
import {distinctArrayFilter} from "../../Utils";

export default class RendezvousHashing {

    private readonly _fanout: number;
    private readonly _hashAlgorithm: string;
    private readonly _targetClusterSize: number;
    private readonly _minClusterSize: number;

    private _clusterCount: number = 0;
    private _clusters: string[][] = [];
    private _virtualLevelCount: number = 0;

    constructor(options: {
        fanout?: number,
        hashAlgorithm?: string,
        targetClusterSize?: number,
        minClusterSize?: number
    } = {}) {
        if (options.fanout != null && options.fanout > 9)
            throw new Error('The fanout option cannot be higher than 9');
        this._fanout = options.fanout || 2;
        this._hashAlgorithm = options.hashAlgorithm || 'md5';
        this._targetClusterSize = options.targetClusterSize || 16;
        this._minClusterSize = options.minClusterSize || this._targetClusterSize;
    }

    private static _logx(value: number, fanout: number) {
        return Math.log(value) / Math.log(fanout);
    }

    private static _getVirtualLevelCount(value: number, fanout: number) {
        return Math.ceil(RendezvousHashing._logx(value, fanout));
    }

    private _hash(key: string): string {
        return crypto.createHash(this._hashAlgorithm).update(key).digest('hex');
    }

    private _generateClusters(sites: string[]) {
        sites = sites.filter(distinctArrayFilter);
        sites.sort();

        this._clusters = [];
        this._clusterCount = Math.ceil(sites.length / this._targetClusterSize);
        for (let i = 0; i < this._clusterCount; i++) this._clusters[i] = [];

        let clusterIndex = 0;
        for(let i = 0; i < sites.length; i++) {
            let cluster = this._clusters[clusterIndex];
            cluster.push(sites[i]);
            if (cluster.length >= this._targetClusterSize) clusterIndex++;
        }

        if (this._clusterCount > 1) {
            const lastCluster = this._clusters[this._clusterCount - 1];
            // If the last cluster doesn't meet minimum capacity requirements,
            // then we will spread out its sites evenly between other clusters.
            if (lastCluster.length < this._minClusterSize) {
                this._clusters.pop();
                this._clusterCount--;
                clusterIndex = 0;
                for(let i = 0; i < lastCluster.length; i++) {
                    const cluster = this._clusters[clusterIndex];
                    cluster.push(lastCluster[i]);
                    clusterIndex = (clusterIndex + 1) % this._clusterCount;
                }
            }
        }
        this._virtualLevelCount = RendezvousHashing._getVirtualLevelCount(this._clusterCount, this._fanout);
    }

    setSites(sites: string[]) {
        this._generateClusters(sites);
    }

    // noinspection JSUnusedGlobalSymbols
    getSites(): string[] {
        const sites: string[] = [];
        for(let i = 0; i < this._clusterCount; i++)
            sites.push(...this._clusters[i]);
        return sites;
    }

    findSite(key: string, salt: number = 0): string | null {
        const saltString = salt.toString();
        let path = '';
        for (let i = 0; i < this._virtualLevelCount; i++) {
            let highestHash: string | null = null;
            let targetVirtualGroup = 0;
            for (let j = 0; j < this._fanout; j++) {
                const currentHash = this._hash(key + saltString + i + j);
                if (!highestHash || currentHash > highestHash) {
                    highestHash = currentHash;
                    targetVirtualGroup = j;
                }
            }
            path += targetVirtualGroup.toString();
        }
        let targetClusterIndex = parseInt(path, this._fanout) || 0;
        let targetCluster = this._clusters[targetClusterIndex];

        if (targetCluster == null) {
            if (targetClusterIndex === 0) return null;
            return this.findSite(key, salt + 1);
        }

        const targetSite = targetCluster[this._findIndexWithHighestRandomWeight(key + salt + path, targetCluster)];
        if (targetSite == null) return this.findSite(key, salt + 1);
        return targetSite;
    }

    private _findIndexWithHighestRandomWeight(item: string, list: string[]): number {
        let targetIndex = 0;
        let highestHash: string | null = null;
        for(let i = 0; i < list.length; i++) {
            const currentHash = this._hash(item + list[i]);
            if (!highestHash || currentHash > highestHash) {
                highestHash = currentHash;
                targetIndex = i;
            }
        }
        return targetIndex;
    }
}