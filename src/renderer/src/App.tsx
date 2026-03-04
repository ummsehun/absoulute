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
    apiReady,
    visualizationRoot,
    focusedTopItems,

    // Actions
    oneClickScan,
  } = useScanLogic();

  const isCompleted = !scanId && Object.keys(aggregateSizes).length > 0;
  const isScanning = Boolean(scanId);

  return (
    <Layout>
      {!isCompleted ? (
        <LandingView
          apiReady={apiReady}
          rootPath={rootPath}
          setRootPath={setRootPath}
          oneClickScan={oneClickScan}
          error={error}
          isScanning={isScanning}
          progress={progress}
        />
      ) : (
        <VisualizationView
          scanId={scanId}
          progress={progress}
          aggregateSizes={aggregateSizes}
          rootPath={rootPath}
          visualizationRoot={visualizationRoot}
          focusedTopItems={focusedTopItems}
          setActiveRootPath={setActiveRootPath}
        />
      )}
    </Layout>
  );
}

export default App;
