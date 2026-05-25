// frontend/src/hooks/useBackupData.ts
/**
 * useBackupData - 备份管理页面的数据加载 Hook
 *
 * 集中管理备份页面所需的全部数据加载和刷新逻辑，
 * 替代 BackupManager 组件中分散的 4 个 useAsyncData 调用。
 */

import { useCallback } from 'react';
import { useAsyncData } from './useAsyncData';
import {
    listBackups, listWebDAVBackups,
    getWebDAVConfig, getAutoBackupStatus,
} from '../services/api';

export function useBackupData() {
    const { data: backups, loading: backupsLoading, refresh: reloadBackups } = useAsyncData(listBackups);
    const { data: webdavBackups, loading: webdavLoading, refresh: reloadWebdav } = useAsyncData(listWebDAVBackups);
    const { data: webdavConfig, loading: configLoading, refresh: reloadWebdavConfig } = useAsyncData(getWebDAVConfig);
    const { data: autoStatus, loading: autoLoading, refresh: reloadAutoStatus } = useAsyncData(getAutoBackupStatus);

    const reloadAll = useCallback(() => {
        reloadBackups();
        reloadWebdav();
        reloadWebdavConfig();
        reloadAutoStatus();
    }, [reloadBackups, reloadWebdav, reloadWebdavConfig, reloadAutoStatus]);

    return {
        backups, backupsLoading, reloadBackups,
        webdavBackups, webdavLoading, reloadWebdav,
        webdavConfig, configLoading, reloadWebdavConfig,
        autoStatus, autoLoading, reloadAutoStatus,
        reloadAll,
    };
}
