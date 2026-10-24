const form = document.querySelector('#contact-form');
const search = document.querySelector('#company-search');
const results = document.querySelector('#results');
const searchStatus = document.querySelector('#search-status');
const formStatus = document.querySelector('#form-status');
const searchButton = document.querySelector('#search-button');
let controller;
let timer;

function showSearchStatus(message, error = false) {
  searchStatus.textContent = message;
  searchStatus.classList.toggle('error', error);
}

function chooseCompany(company) {
  form.elements.business.value = company.nom_complet || company.nom_raison_sociale || '';
  form.elements.siren.value = company.siren || '';
  search.value = form.elements.business.value;
  results.replaceChildren();
  showSearchStatus('Entreprise sélectionnée. Vérifiez le nom avant de continuer.');
  form.elements.firstName.focus();
}

async function runSearch() {
  const query = search.value.trim();
  if (query.length < 3) {
    results.replaceChildren();
    showSearchStatus('Saisissez au moins 3 caractères.', true);
    return;
  }
  controller?.abort();
  controller = new AbortController();
  const active = controller;
  results.replaceChildren();
  showSearchStatus('Recherche en cours…');
  searchButton.disabled = true;
  try {
    const url = new URL('https://recherche-entreprises.api.gouv.fr/search');
    url.searchParams.set('q', query);
    url.searchParams.set('per_page', '6');
    const response = await fetch(url, {
      signal: active.signal,
      headers: { accept: 'application/json' }
    });
    if (!response.ok) throw new Error(response.status === 429 ? 'Trop de recherches. Réessayez dans un instant.' : 'Recherche momentanément indisponible.');
    const data = await response.json();
    const companies = Array.isArray(data.results) ? data.results : [];
    if (!companies.length) {
      showSearchStatus('Aucun résultat. Remplissez le nom du commerce manuellement.');
      return;
    }
    showSearchStatus(`${companies.length} résultat${companies.length > 1 ? 's' : ''} — sélectionnez votre entreprise.`);
    for (const company of companies) {
      const button = document.createElement('button');
      const name = document.createElement('strong');
      const detail = document.createElement('span');
      button.type = 'button';
      button.className = 'result';
      name.textContent = company.nom_complet || company.nom_raison_sociale || 'Entreprise';
      detail.textContent = `SIREN ${company.siren || '—'} · ${company.siege?.libelle_commune || 'Ville non renseignée'}`;
      button.append(name, detail);
      button.addEventListener('click', () => chooseCompany(company));
      results.append(button);
    }
  } catch (error) {
    if (error.name !== 'AbortError') showSearchStatus(`${error.message} Vous pouvez remplir la fiche manuellement.`, true);
  } finally {
    if (controller === active) searchButton.disabled = false;
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
  if (search.value.trim().length >= 3) timer = setTimeout(runSearch, 500);
  else { controller?.abort(); results.replaceChildren(); showSearchStatus(''); }
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
      form.reset();
      search.value = '';
      results.replaceChildren();
      formStatus.textContent = 'Demande envoyée. Nous vous répondrons personnellement.';
    } catch (error) {
      formStatus.textContent = `${error.message} Réessayez plus tard ou écrivez-nous directement.`;
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
