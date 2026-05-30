# backend/app/schemas/nfc.py
"""NFC 相关 Pydantic 模型

⚠️ 历史清理 (2026-05):
原文件包含三个模型 ``NFCWriteRequest`` / ``NFCWriteResponse`` / ``NFCReadResponse``,
定义为"NFC 物理标签直接读写"语义 (location_code / tag_uid 等), 但全代码库未
被任何业务代码引用 (仅在 ``app/schemas/__init__.py`` 中 re-export)。

为避免与 ``app/api/nfc_bridge/schemas.py`` 中"任务化写入"语义的同名类
混淆, 这三个僵尸定义已被移除。

如果未来确需"直接物理写入"语义模型, 请在此文件中以 ``NfcDirect*`` 前缀新增。
"""
