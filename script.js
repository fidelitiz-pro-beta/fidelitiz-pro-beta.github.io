const form = document.querySelector('#contact-form');
const search = document.querySelector('#company-search');
const results = document.querySelector('#results');
const searchStatus = document.querySelector('#search-status');
const formStatus = document.querySelector('#form-status');
const searchButton = document.querySelector('#search-button');
const manualToggle = document.querySelector('#manual-toggle');
const manualFields = document.querySelector('#manual-fields');
const selectedView = document.querySelector('#selected-company');
const popover = document.querySelector('#success-popover');
const closePopover = document.querySelector('#success-close');
const contactApi = form.dataset.apiUrl;
const searchCache = new Map();
let controller;
let timer;
let searchVersion = 0;
let selectedCompany = null;

function showSearchStatus(message, error = false) {
  searchStatus.textContent = message;
  searchStatus.classList.toggle('error', error);
}

function setManual(open) {
  manualFields.hidden = !open;
  manualToggle.setAttribute('aria-expanded', String(open));
  manualToggle.textContent = open ? 'Masquer la saisie manuelle' : 'Vous ne voyez pas votre entreprise ? Cliquez ici';
  for (const name of ['business', 'firstName', 'lastName', 'email', 'consent']) form.elements[name].required = open;
  if (open) {
    selectedCompany = null;
    selectedView.hidden = true;
    form.elements.business.focus();
  }
}

function chooseCompany(company) {
  setManual(false);
  selectedCompany = company;
  search.value = company.nom_complet || company.nom_raison_sociale || '';
  selectedView.textContent = `${search.value} · SIREN ${company.siren}`;
  selectedView.hidden = false;
  results.replaceChildren();
  showSearchStatus('');
  formStatus.textContent = '';
}

function showCompanies(companies) {
  results.replaceChildren();
  if (!companies.length) {
    showSearchStatus('Aucun résultat. Vous pouvez renseigner votre entreprise manuellement.');
    return;
  }
  showSearchStatus(`${companies.length} résultat${companies.length > 1 ? 's' : ''} — sélectionnez votre entreprise.`);
  const fragment = document.createDocumentFragment();
  for (const company of companies) {
    if (!/^\d{9}$/.test(company.siren || '')) continue;
    const button = document.createElement('button');
    const name = document.createElement('strong');
    const detail = document.createElement('span');
    button.type = 'button';
    button.className = 'result';
    name.textContent = company.nom_complet || company.nom_raison_sociale || 'Entreprise';
    detail.textContent = `SIREN ${company.siren}`;
    button.append(name, detail);
    button.addEventListener('click', () => chooseCompany(company));
    fragment.append(button);
  }
  results.append(fragment);
}

async function runSearch() {
  const query = search.value.trim();
  if (query.length < 3) {
    results.replaceChildren();
    showSearchStatus('Saisissez au moins 3 caractères.', true);
    return;
  }
  const version = ++searchVersion;
  controller?.abort();
  const key = query.toLocaleLowerCase('fr-FR');
  const cached = searchCache.get(key);
  if (cached && Date.now() - cached.time < 10 * 60 * 1000) {
    showCompanies(cached.companies);
    searchButton.disabled = false;
    return;
  }
  controller = new AbortController();
  const active = controller;
  results.replaceChildren();
  showSearchStatus('Recherche en cours…');
  searchButton.disabled = true;
  try {
    const url = new URL('https://recherche-entreprises.api.gouv.fr/search');
    url.searchParams.set('q', query);
    url.searchParams.set('per_page', '6');
    url.searchParams.set('minimal', 'true');
    const response = await fetch(url, { signal: active.signal, headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(response.status === 429 ? 'Trop de recherches. Réessayez dans un instant.' : 'Recherche momentanément indisponible.');
    const data = await response.json();
    if (version !== searchVersion) return;
    const companies = Array.isArray(data.results) ? data.results : [];
    searchCache.set(key, { companies, time: Date.now() });
    showCompanies(companies);
  } catch (error) {
    if (version === searchVersion && error.name !== 'AbortError') {
      showSearchStatus(`${error instanceof TypeError ? 'Annuaire momentanément indisponible.' : error.message} Utilisez la saisie manuelle.`, true);
    }
  } finally {
    if (controller === active) {
      controller = undefined;
      searchButton.disabled = false;
    }
  }
}

searchButton.addEventListener('click', runSearch);
search.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    clearTimeout(timer);
    runSearch();
  }
});
search.addEventListener('input', () => {
  clearTimeout(timer);
  ++searchVersion;
  controller?.abort();
  controller = undefined;
  searchButton.disabled = false;
  selectedCompany = null;
  selectedView.hidden = true;
  results.replaceChildren();
  formStatus.textContent = '';
  const query = search.value.trim();
  if (query.length >= 3) timer = setTimeout(runSearch, /^\d{9}(\d{5})?$/.test(query) ? 0 : 300);
  else showSearchStatus('');
});
manualToggle.addEventListener('click', () => setManual(manualFields.hidden));

function openSuccess() {
  popover.hidden = false;
  document.body.classList.add('popover-open');
  closePopover.focus();
}
function hideSuccess() {
  popover.hidden = true;
  document.body.classList.remove('popover-open');
  search.focus();
}
closePopover.addEventListener('click', hideSuccess);
popover.addEventListener('click', event => { if (event.target === popover) hideSuccess(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !popover.hidden) hideSuccess(); });

function payload() {
  if (!manualFields.hidden) return {
    mode: 'manual',
    firstName: form.elements.firstName.value.trim(),
    lastName: form.elements.lastName.value.trim(),
    email: form.elements.email.value.trim(),
    business: form.elements.business.value.trim(),
    siren: form.elements.siren.value.trim(),
    message: form.elements.message.value.trim(),
    consent: form.elements.consent.checked,
  };
  const company = selectedCompany;
  if (!company) return null;
  const siege = company.siege || {};
  return {
    mode: 'directory',
    business: company.nom_complet || company.nom_raison_sociale || '',
    siren: company.siren || '',
    siret: siege.siret || '',
    address: siege.adresse || '',
    postalCode: siege.code_postal || '',
    city: siege.libelle_commune || '',
    activity: company.activite_principale || '',
    legalForm: company.nature_juridique || '',
  };
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const data = payload();
  if (!data) {
    showSearchStatus('Sélectionnez votre entreprise dans les résultats.', true);
    search.focus();
    return;
  }
  if (!form.reportValidity()) return;
  const button = form.querySelector('.submit');
  button.disabled = true;
  formStatus.textContent = 'Envoi en cours…';
  try {
    const response = await fetch(`${contactApi.replace(/\/$/, '')}/api/contact`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Envoi indisponible.');
    clearTimeout(timer);
    ++searchVersion;
    controller?.abort();
    controller = undefined;
    searchButton.disabled = false;
    selectedCompany = null;
    form.reset();
    search.value = '';
    results.replaceChildren();
    selectedView.hidden = true;
    setManual(false);
    showSearchStatus('');
    formStatus.textContent = '';
    openSuccess();
  } catch (error) {
    formStatus.textContent = `${error instanceof TypeError ? 'Connexion impossible avec le serveur.' : error.message} Réessayez plus tard ou écrivez-nous directement.`;
  } finally { button.disabled = false; }
});
