const form = document.querySelector('#contact-form');
const search = document.querySelector('#company-search');
const results = document.querySelector('#results');
const searchStatus = document.querySelector('#search-status');
const formStatus = document.querySelector('#form-status');
const searchButton = document.querySelector('#search-button');
const businessInput = form.elements.business;
const searchCache = new Map();
let controller;
let timer;
let searchVersion = 0;
let autoBusiness = '';

function showSearchStatus(message, error = false) {
  searchStatus.textContent = message;
  searchStatus.classList.toggle('error', error);
}

function chooseCompany(company) {
  businessInput.value = company.nom_complet || company.nom_raison_sociale || '';
  autoBusiness = businessInput.value;
  form.elements.siren.value = company.siren || '';
  search.value = businessInput.value;
  results.replaceChildren();
  showSearchStatus('Entreprise sélectionnée. Vérifiez le nom avant de continuer.');
  form.elements.firstName.focus();
}

function showCompanies(companies) {
  results.replaceChildren();
  if (!companies.length) {
    showSearchStatus('Aucun résultat. Le nom du commerce peut être saisi manuellement.');
    return;
  }
  showSearchStatus(`${companies.length} résultat${companies.length > 1 ? 's' : ''} — sélectionnez votre entreprise.`);
  const fragment = document.createDocumentFragment();
  for (const company of companies) {
    const button = document.createElement('button');
    const name = document.createElement('strong');
    const detail = document.createElement('span');
    button.type = 'button';
    button.className = 'result';
    name.textContent = company.nom_complet || company.nom_raison_sociale || 'Entreprise';
    detail.textContent = `SIREN ${company.siren || '—'}`;
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
  showSearchStatus('Recherche en cours… Vous pouvez continuer à remplir le formulaire.');
  searchButton.disabled = true;
  try {
    const url = new URL('https://recherche-entreprises.api.gouv.fr/search');
    url.searchParams.set('q', query);
    url.searchParams.set('per_page', '6');
    url.searchParams.set('minimal', 'true');
    const response = await fetch(url, {
      signal: active.signal,
      headers: { accept: 'application/json' }
    });
    if (!response.ok) throw new Error(response.status === 429 ? 'Trop de recherches. Réessayez dans un instant.' : 'Recherche momentanément indisponible.');
    const data = await response.json();
    if (version !== searchVersion) return;
    const companies = Array.isArray(data.results) ? data.results : [];
    searchCache.set(key, { companies, time: Date.now() });
    showCompanies(companies);
  } catch (error) {
    if (version === searchVersion && error.name !== 'AbortError') {
      const message = error instanceof TypeError ? 'Annuaire momentanément indisponible.' : error.message;
      showSearchStatus(`${message} Vous pouvez remplir la fiche manuellement.`, true);
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
  const query = search.value.trim();
  if (!/^\d{9}(\d{5})?$/.test(query) && (!businessInput.value || businessInput.value === autoBusiness)) {
    businessInput.value = query;
    autoBusiness = query;
  }
  results.replaceChildren();
  if (query.length >= 3) timer = setTimeout(runSearch, /^\d{9}(\d{5})?$/.test(query) ? 0 : 300);
  else showSearchStatus('');
});

function demandText() {
  const data = new FormData(form);
  return `Bonjour FIDELITIZ,\n\nJe souhaite participer à la bêta pour mon commerce.\n\nEntreprise : ${data.get('business')}\nSIREN : ${data.get('siren') || 'Non renseigné'}\n\nContact : ${data.get('firstName')} ${data.get('lastName')}\nE-mail : ${data.get('email')}\n\nMon projet : ${data.get('message') || 'Je souhaite en savoir plus.'}\n\nJ’accepte l’utilisation de ces informations pour recevoir une réponse à ma demande.`;
}

const contactApi = form.dataset.apiUrl;
if (contactApi) {
  form.querySelector('.submit').innerHTML = 'Envoyer ma demande <span aria-hidden="true">↗</span>';
  form.querySelector('.send-note').textContent = 'Votre demande sera transmise à l’équipe FIDELITIZ.';
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  if (contactApi) {
    const button = form.querySelector('.submit');
    button.disabled = true;
    formStatus.textContent = 'Envoi en cours…';
    try {
      const response = await fetch(`${contactApi.replace(/\/$/, '')}/api/contact`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          firstName: form.elements.firstName.value.trim(),
          lastName: form.elements.lastName.value.trim(),
          email: form.elements.email.value.trim(),
          business: form.elements.business.value.trim(),
          siren: form.elements.siren.value.trim(),
          message: form.elements.message.value.trim(),
          consent: form.elements.consent.checked,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Envoi indisponible.');
      clearTimeout(timer);
      ++searchVersion;
      controller?.abort();
      controller = undefined;
      searchButton.disabled = false;
      form.reset();
      search.value = '';
      autoBusiness = '';
      results.replaceChildren();
      showSearchStatus('');
      formStatus.textContent = 'Votre demande a bien été envoyée. Notre équipe vous contactera rapidement.';
    } catch (error) {
      const message = error instanceof TypeError ? 'Connexion impossible avec le serveur.' : error.message;
      formStatus.textContent = `${message} Réessayez plus tard ou écrivez-nous directement.`;
    } finally { button.disabled = false; }
    return;
  }
  const subject = `Bêta FIDELITIZ — ${form.elements.business.value}`;
  formStatus.textContent = 'Votre messagerie va s’ouvrir. Vérifiez et envoyez votre e-mail pour finaliser la demande.';
  window.location.href = `mailto:bonjour@fidelitiz.fr?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(demandText())}`;
});

document.querySelector('#copy-button').addEventListener('click', async () => {
  if (!form.reportValidity()) return;
  try {
    await navigator.clipboard.writeText(demandText());
    formStatus.textContent = 'Demande copiée. Envoyez-la à bonjour@fidelitiz.fr.';
  } catch {
    formStatus.textContent = 'Copie indisponible sur cet appareil. Utilisez le bouton « Préparer mon e-mail ».';
  }
});
