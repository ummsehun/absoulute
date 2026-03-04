import React from 'react';
import { useScanLogic } from './hooks/useScanLogic';
import { Layout } from './components/Layout';
import { LandingView } from './components/LandingView';
import { VisualizationView } from './components/VisualizationView';

function App() {
  const {
    // State
    rootPath, setRootPath,
    scanId,
    progress,
    error,
    aggregateSizes,
    setActiveRootPath,
    scanBasePath,
    scanStartedAt,
    apiReady,
    visualizationRoot,
    breadcrumbPaths,
    focusedTopItems,

    // Actions
    oneClickScan,
    startScan,
    cancelScan,
    pauseScan,
    minimizeWindow,
    toggleMaximizeWindow,
    closeWindow,
  } = useScanLogic();

  const isStarted = Boolean(scanId) || Object.keys(aggregateSizes).length > 0;

  return (
    <Layout
      apiReady={apiReady}
      onMinimize={minimizeWindow}
      onMaximize={toggleMaximizeWindow}
      onClose={closeWindow}
    >
      {!isStarted ? (
        <LandingView
          apiReady={apiReady}
          rootPath={rootPath}
          setRootPath={setRootPath}
          oneClickScan={oneClickScan}
          error={error}
        />
      ) : (
        <VisualizationView
          scanId={scanId}
          progress={progress}
          scanStartedAt={scanStartedAt}
          aggregateSizes={aggregateSizes}
          scanBasePath={scanBasePath}
          rootPath={rootPath}
          visualizationRoot={visualizationRoot}
          breadcrumbPaths={breadcrumbPaths}
          focusedTopItems={focusedTopItems}
          setActiveRootPath={setActiveRootPath}
          startScan={startScan}
          pauseScan={pauseScan}
          cancelScan={cancelScan}
        />
      )}
    </Layout>
  );
}

export default App;
