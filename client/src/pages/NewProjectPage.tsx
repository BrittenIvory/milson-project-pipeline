import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ProjectForm, { emptyProject } from '../components/ProjectForm';
import { PageHeader } from '../components/ui';
import { apiErrorMessage, projectsApi } from '../lib/api';
import type { ProjectPayload } from '../lib/api';

/** Create screen for a new project; the number is reserved on save. */
export default function NewProjectPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<ProjectPayload>(emptyProject);
  const [projectNumber, setProjectNumber] = useState('…');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    projectsApi.nextNumber().then(setProjectNumber).catch(() => setProjectNumber('P-0001'));
  }, []);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const project = await projectsApi.create(form);
      navigate(`/projects/${project.id}`);
    } catch (err) {
      setError(apiErrorMessage(err, 'Unable to create project'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="New Project"
        description="Projects start in the Pipeline stage and can be moved forward later."
      />
      <ProjectForm
        value={form}
        onChange={setForm}
        onSubmit={submit}
        onCancel={() => navigate('/projects')}
        saving={saving}
        error={error}
        submitLabel="Create project"
        projectNumber={projectNumber}
      />
    </div>
  );
}
