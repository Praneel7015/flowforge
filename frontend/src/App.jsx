import React, { useState, useEffect } from 'react';
import axios from 'axios';
import WorkflowEditor from './workflow/WorkflowEditor';
import Sidebar from './components/Sidebar';
import PromptPanel from './components/PromptPanel';
import YamlPreview from './components/YamlPreview';
import JenkinsConverter from './components/JenkinsConverter';
import HealthAdvisor from './components/HealthAdvisor';
import PipelineChat from './components/PipelineChat';
import Header from './components/Header';
import BringYourOwnModelPanel from './components/BringYourOwnModelPanel';

export default function App() {
  const [yamlOutput, setYamlOutput] = useState('');
  const [activePanel, setActivePanel] = useState('builder');
  const [importedWorkflow, setImportedWorkflow] = useState(null);

  // Provider state
  const [providers, setProviders] = useState({ ai: [], cicd: [], defaults: {} });
  const [selectedProviders, setSelectedProviders] = useState({
    ai: null,
    cicd: null,
  });
  const [byomConfig, setByomConfig] = useState({
    enabled: false,
    apiKey: '',
    model: '',
    baseUrl: '',
  });
  const [providersLoaded, setProvidersLoaded] = useState(false);

  // Fetch available providers on mount
  useEffect(() => {
    axios
      .get('/api/config/providers')
      .then(({ data }) => {
        setProviders(data);
        setSelectedProviders({
          ai: data.defaults?.aiProvider || data.ai.find((p) => p.enabled)?.name || data.ai[0]?.name || 'featherless',
          cicd: data.defaults?.cicdPlatform || 'gitlab',
        });
        setProvidersLoaded(true);
      })
      .catch((err) => {
        console.error('Failed to load providers:', err);
        // Set defaults if API fails
        setProviders({
          ai: [
            { name: 'featherless', displayName: 'Featherless AI', enabled: false },
            { name: 'anthropic', displayName: 'Claude (Anthropic)', enabled: false },
            { name: 'gemini', displayName: 'Gemini (Google)', enabled: false },
            { name: 'openai', displayName: 'GPT-4 (OpenAI)', enabled: false },
            { name: 'ollama', displayName: 'Ollama (Local)', enabled: true },
          ],
          cicd: [
            { name: 'gitlab', displayName: 'GitLab CI', fileName: '.gitlab-ci.yml', enabled: true },
            { name: 'github', displayName: 'GitHub Actions', fileName: '.github/workflows/ci.yml', enabled: true },
            { name: 'jenkins', displayName: 'Jenkins Pipeline', fileName: 'Jenkinsfile', enabled: true },
            { name: 'circleci', displayName: 'CircleCI', fileName: '.circleci/config.yml', enabled: true },
          ],
          defaults: { aiProvider: 'featherless', cicdPlatform: 'gitlab' },
        });
        setSelectedProviders({ ai: 'featherless', cicd: 'gitlab' });
        setProvidersLoaded(true);
      });
  }, []);

  const handleGenerated = (result) => {
    setYamlOutput(result.yaml);
    setImportedWorkflow({ nodes: result.nodes, edges: result.edges });
    setActivePanel('builder');
  };

  const handleProviderChange = (type, value) => {
    setSelectedProviders((prev) => ({ ...prev, [type]: value }));
  };

  const aiOptions = byomConfig.enabled
    ? {
        apiKey: byomConfig.apiKey,
        model: byomConfig.model,
        baseUrl: byomConfig.baseUrl,
      }
    : undefined;

  // Get current CI/CD platform metadata
  const currentCICDPlatform = providers.cicd.find((p) => p.name === selectedProviders.cicd) || {
    name: 'gitlab',
    displayName: 'GitLab CI',
    fileName: '.gitlab-ci.yml',
  };

  const showSidebar = activePanel === 'builder';
  const showYamlPanel = yamlOutput && activePanel !== 'chat' && activePanel !== 'health';

  return (
    <div className="h-screen flex flex-col ff-app-shell text-slate-100">
      <Header
        activePanel={activePanel}
        setActivePanel={setActivePanel}
        providers={providers}
        selectedProviders={selectedProviders}
        onProviderChange={handleProviderChange}
        byomEnabled={byomConfig.enabled}
      />

      {providersLoaded && (
        <div className="px-3 pt-2">
          <BringYourOwnModelPanel
            selectedProvider={selectedProviders.ai}
            value={byomConfig}
            onChange={setByomConfig}
          />
        </div>
      )}

      <div className="flex flex-1 overflow-hidden gap-3 p-3 pt-2">
        {/* Left sidebar — node palette (builder only) */}
        {showSidebar && <Sidebar />}

        {/* Main content */}
        <div className="flex-1 relative overflow-hidden ff-surface ff-enter">
          {activePanel === 'builder' && (
            <WorkflowEditor
              onYamlExport={setYamlOutput}
              importedWorkflow={importedWorkflow}
              cicdPlatform={selectedProviders.cicd}
            />
          )}
          {activePanel === 'prompt' && (
            <PromptPanel
              onGenerated={handleGenerated}
              aiProvider={selectedProviders.ai}
              cicdPlatform={selectedProviders.cicd}
              aiOptions={aiOptions}
            />
          )}
          {activePanel === 'jenkins' && (
            <JenkinsConverter
              onConverted={handleGenerated}
              aiProvider={selectedProviders.ai}
              cicdPlatform={selectedProviders.cicd}
              aiOptions={aiOptions}
            />
          )}
          {activePanel === 'health' && (
            <HealthAdvisor
              currentYaml={yamlOutput}
              aiProvider={selectedProviders.ai}
              cicdPlatform={selectedProviders.cicd}
              aiOptions={aiOptions}
            />
          )}
          {activePanel === 'chat' && (
            <PipelineChat
              currentYaml={yamlOutput}
              aiProvider={selectedProviders.ai}
              cicdPlatform={selectedProviders.cicd}
              aiOptions={aiOptions}
            />
          )}
        </div>

        {/* Right panel — YAML preview */}
        {showYamlPanel && (
          <YamlPreview
            yaml={yamlOutput}
            onClose={() => setYamlOutput('')}
            platform={currentCICDPlatform}
          />
        )}
      </div>
    </div>
  );
}
