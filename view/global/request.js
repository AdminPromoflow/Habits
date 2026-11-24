'use strict';

const actionControllers = new Map();
const requestRoutes = JSON.parse(document.getElementById('request-routes').textContent);

class AjaxRequest {
  async makeRequest(action, body = null, params = {}, scoped = true) {
    const shared = S.sharedWorkspace;
    if (scoped && shared) {
      if (['data', 'mindspace', 'diagrams'].includes(action)) {
        const result = await this.makeRequest('sharedMindSpace', null, {id:shared.id}, false);
        if (S.sharedWorkspace !== shared) throw new Error(t('error_not_found'));
        Object.assign(shared, result);
        if (action !== 'data') return result.workspace[action];
        const data = await this.makeRequest('data', null, params, false);
        if (S.sharedWorkspace !== shared) throw new Error(t('error_not_found'));
        S.ownedWorkspace = sharedOwnCatalog(data);
        return {...data, ...result.workspace};
      }
      if (['saveMindSpaceItem','createMindSpaceItem','renameMindSpace','addMindSpaceHabit','moveMindSpaceItem','deleteMindSpaceItem','deleteMindSpace','saveDiagram','deleteDiagram','saveHabit','archiveHabit','complete'].includes(action)) {
        return this.makeRequest('sharedMindSpaceAction', {share_id:shared.id, action, data:body}, {}, false);
      }
    }
    const module = requestRoutes[action];
    if (!module) throw new Error(t('error_not_found'));
    const query = new URLSearchParams({ ...params, action });
    let response;
    try {
      response = await fetch(`controller/${module}/index.php?${query}`, {
        method: body === null ? 'GET' : 'POST',
        credentials: 'same-origin',
        headers:
          body === null ? {} : { 'Content-Type': 'application/json', 'X-CSRF-Token': S.csrf },
        body: body === null ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new Error(t('connection_error'));
    }
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error(t('error_server'));
    }
    if (!response.ok || !data.ok) {
      const error = new Error(t(data.error || 'error_server'));
      error.key = data.error;
      error.status = response.status;
      if (response.status === 401 && S.user) {
        S.user = null;
        pageControllers.home.reset();
        render();
      }
      throw error;
    }
    return data.result;
  }
}

const ajaxRequest = new AjaxRequest();
const api = (action, body = null, params = {}) => ajaxRequest.makeRequest(action, body, params);

class PageController {
  constructor(actions = []) {
    for (const action of actions) {
      if (actionControllers.has(action)) throw new Error(`Duplicate action: ${action}`);
      actionControllers.set(action, this);
    }
  }

  makeRequest(action, body = null, params = {}) {
    return ajaxRequest.makeRequest(action, body, params);
  }
}

// PHP owns the HTML skeleton; each view supplies its already-escaped dynamic slots.
function renderTemplate(name, values = {}) {
  const template = document.getElementById(`view-${name}`);
  if (!template) throw new Error(`Missing view: ${name}`);
  return template.innerHTML.replace(/\{\{(\w+)\}\}/g, (_, key) => String(values[key] ?? ''));
}
