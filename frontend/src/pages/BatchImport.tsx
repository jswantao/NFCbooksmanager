// frontend/src/pages/BatchImport.tsx
/**
 * 批量导入页面 - React 19 + Ant Design 6
 *
 * 架构：Hook (useBatchImportWizard) + 步骤子组件
 * 拆分子组件: StepUpload / StepPreview / StepProgress / StepComplete
 * 弹窗: ImportResultsModal / ImportErrorsModal
 */

import React, { type FC } from "react";
import {
    Card, Steps, Typography, Breadcrumb, FloatButton, App, theme,
} from "antd";
import {
    UploadOutlined, EyeOutlined, SyncOutlined, CheckCircleOutlined,
    HomeOutlined, DatabaseOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { useBatchImportWizard, type StepType } from "../hooks/useBatchImportWizard";
import StepUpload from "../components/import/StepUpload";
import StepPreview from "../components/import/StepPreview";
import StepProgress from "../components/import/StepProgress";
import StepComplete from "../components/import/StepComplete";
import ImportResultsModal from "../components/import/ImportResultsModal";
import ImportErrorsModal from "../components/import/ImportErrorsModal";
import QuickTips from "../components/import/QuickTips";

const { Title } = Typography;

const IMPORT_STEPS = [
    { key: "upload" as const, title: "上传文件", icon: <UploadOutlined /> },
    { key: "preview" as const, title: "预览确认", icon: <EyeOutlined /> },
    { key: "importing" as const, title: "正在导入", icon: <SyncOutlined spin /> },
    { key: "complete" as const, title: "导入完成", icon: <CheckCircleOutlined /> },
];

const STEP_INDEX: Record<StepType, number> = {
    upload: 0, preview: 1, importing: 2, complete: 3,
};

const BatchImport: FC = () => {
    const navigate = useNavigate();
    const { message } = App.useApp();
    const { token } = theme.useToken();

    const wiz = useBatchImportWizard(navigate, message);

    const stepContentMap: Record<StepType, () => React.ReactNode> = {
        upload: () => (
            <>
                <StepUpload
                    file={wiz.file}
                    uploading={wiz.uploading}
                    uploadError={wiz.uploadError}
                    shelfList={wiz.shelfList}
                    targetShelfId={wiz.targetShelfId}
                    autoSync={wiz.autoSync}
                    syncDelay={wiz.syncDelay}
                    isNedb={wiz.isNedb}
                    onFileSelect={wiz.handleFileSelect}
                    onPreview={wiz.handlePreview}
                    onDownloadTemplate={wiz.handleDownloadTemplate}
                    onShelfChange={wiz.setTargetShelfId}
                    onAutoSyncChange={wiz.setAutoSync}
                    onSyncDelayChange={wiz.setSyncDelay}
                />
                <QuickTips />
            </>
        ),
        preview: () =>
            wiz.preview ? (
                <StepPreview
                    preview={wiz.preview}
                    isNedb={wiz.isNedb}
                    onStart={wiz.handleStartImport}
                    onReset={wiz.handleReset}
                />
            ) : (
                <StepUpload
                    file={wiz.file}
                    uploading={wiz.uploading}
                    uploadError={wiz.uploadError}
                    shelfList={wiz.shelfList}
                    targetShelfId={wiz.targetShelfId}
                    autoSync={wiz.autoSync}
                    syncDelay={wiz.syncDelay}
                    isNedb={wiz.isNedb}
                    onFileSelect={wiz.handleFileSelect}
                    onPreview={wiz.handlePreview}
                    onDownloadTemplate={wiz.handleDownloadTemplate}
                    onShelfChange={wiz.setTargetShelfId}
                    onAutoSyncChange={wiz.setAutoSync}
                    onSyncDelayChange={wiz.setSyncDelay}
                />
            ),
        importing: () =>
            wiz.task ? (
                <StepProgress task={wiz.task} onCancel={wiz.handleCancel} />
            ) : (
                <StepUpload
                    file={wiz.file}
                    uploading={wiz.uploading}
                    uploadError={wiz.uploadError}
                    shelfList={wiz.shelfList}
                    targetShelfId={wiz.targetShelfId}
                    autoSync={wiz.autoSync}
                    syncDelay={wiz.syncDelay}
                    isNedb={wiz.isNedb}
                    onFileSelect={wiz.handleFileSelect}
                    onPreview={wiz.handlePreview}
                    onDownloadTemplate={wiz.handleDownloadTemplate}
                    onShelfChange={wiz.setTargetShelfId}
                    onAutoSyncChange={wiz.setAutoSync}
                    onSyncDelayChange={wiz.setSyncDelay}
                />
            ),
        complete: () =>
            wiz.task ? (
                <StepComplete
                    task={wiz.task}
                    onShowResults={() => wiz.setShowResults(true)}
                    onShowErrors={() => wiz.setShowErrors(true)}
                    onReset={wiz.handleReset}
                    onGoHome={wiz.handleGoHome}
                />
            ) : (
                <StepUpload
                    file={wiz.file}
                    uploading={wiz.uploading}
                    uploadError={wiz.uploadError}
                    shelfList={wiz.shelfList}
                    targetShelfId={wiz.targetShelfId}
                    autoSync={wiz.autoSync}
                    syncDelay={wiz.syncDelay}
                    isNedb={wiz.isNedb}
                    onFileSelect={wiz.handleFileSelect}
                    onPreview={wiz.handlePreview}
                    onDownloadTemplate={wiz.handleDownloadTemplate}
                    onShelfChange={wiz.setTargetShelfId}
                    onAutoSyncChange={wiz.setAutoSync}
                    onSyncDelayChange={wiz.setSyncDelay}
                />
            ),
    };

    return (
        <div style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
            <Breadcrumb
                style={{ marginBottom: 16 }}
                items={[
                    { title: <a onClick={() => navigate("/")}><HomeOutlined /> 首页</a> },
                    { title: <span><DatabaseOutlined /> 批量导入</span> },
                ]}
            />

            <Title level={2} style={{ marginBottom: 24 }}>
                <DatabaseOutlined style={{ marginRight: 12, color: token.colorPrimary }} />
                批量导入图书
            </Title>

            <Card style={{ marginBottom: 24, borderRadius: 12 }}>
                <Steps
                    current={STEP_INDEX[wiz.step]}
                    items={IMPORT_STEPS.map((s) => ({
                        title: s.title,
                        icon: s.key === "importing" && wiz.step === "importing"
                            ? <SyncOutlined spin /> : s.icon,
                    }))}
                    size="small"
                />
            </Card>

            {stepContentMap[wiz.step]()}

            {wiz.task && (
                <>
                    <ImportResultsModal
                        open={wiz.showResults}
                        onClose={() => wiz.setShowResults(false)}
                        results={wiz.task.results ?? []}
                    />
                    <ImportErrorsModal
                        open={wiz.showErrors}
                        onClose={() => wiz.setShowErrors(false)}
                        errors={wiz.task.errors ?? []}
                    />
                </>
            )}

            <FloatButton.BackTop visibilityHeight={400} style={{ right: 40, bottom: 40 }} />
        </div>
    );
};

export default BatchImport;
