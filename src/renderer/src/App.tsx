import { useMemo } from 'react';
import { useScanLogic } from './hooks/useScanLogic';
import { Layout } from './components/Layout';
import { LandingView } from './components/LandingView';
import { VisualizationView } from './components/VisualizationView';

function App() {
  const {
    // State
    rootPath, setRootPath,
    scanId,
    scanTerminal,
    progress,
    error,
    coverageUpdate,
    diagnostics,
    perfSample,
    elevationRequired,
    fullDiskAccessStatus,
    helperStatus,
    aggregateSizes,
    setActiveRootPath,
    apiReady,
    visualizationRoot,
    focusedTopItems,
    windowState,

    // Actions
    oneClickScan,
    scanExactRoot,
    resolveElevation,
    checkFullDiskAccess,
    requestFullDiskAccess,
    checkHelperStatus,
    registerHelper,
  } = useScanLogic();

  const isCompleted = useMemo(
    () =>
      !error
      && !elevationRequired
      && scanTerminal?.status === "done"
      && Object.keys(aggregateSizes).length > 0,
    [error, elevationRequired, scanTerminal, aggregateSizes],
  );
  const isScanning = Boolean(scanId);

  return (
    <Layout>
      {!isCompleted ? (
        <LandingView
          apiReady={apiReady}
          rootPath={rootPath}
          setRootPath={setRootPath}
          oneClickScan={oneClickScan}
          onResolveElevation={resolveElevation}
          onRequestFullDiskAccess={requestFullDiskAccess}
          onCheckFullDiskAccess={checkFullDiskAccess}
          onCheckHelperStatus={checkHelperStatus}
          onRegisterHelper={registerHelper}
          error={error}
          fullDiskAccessStatus={fullDiskAccessStatus}
          helperStatus={helperStatus}
          coverageUpdate={coverageUpdate}
          elevationRequired={elevationRequired}
          isScanning={isScanning}
          progress={progress}
          diagnostics={diagnostics}
          perfSample={perfSample}
          windowState={windowState}
        />
      ) : (
        <VisualizationView
          scanId={scanId}
          progress={progress}
          aggregateSizes={aggregateSizes}
          rootPath={rootPath}
          visualizationRoot={visualizationRoot}
          focusedTopItems={focusedTopItems}
          coverageUpdate={coverageUpdate}
          diagnostics={diagnostics}
          perfSample={perfSample}
          onExactRecheck={scanExactRoot}
          setActiveRootPath={setActiveRootPath}
        />
      )}
    </Layout>
  );
}

export default App;
