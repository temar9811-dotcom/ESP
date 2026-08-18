'use strict';

window.ESP = window.ESP || {};

ESP.getModalRoot = function () {
  return document.getElementById('modal-root');
};

ESP.renderModals = function () {
  const modalRoot = ESP.getModalRoot();
  if (!modalRoot) return;

  if (ESP.state.addPlanState) {
    modalRoot.innerHTML = ESP.addPlanModalHtml();
  } else if (ESP.state.groupState) {
    modalRoot.innerHTML = ESP.groupModalHtml();
  } else if (ESP.state.planDetail) {
    modalRoot.innerHTML = ESP.planDetailModalHtml(ESP.state.planDetail);
  } else if (ESP.state.settingsOpen) {
    modalRoot.innerHTML = ESP.settingsModalHtml(ESP.state.settings);
  } else if (ESP.state.addCharacter) {
    modalRoot.innerHTML = ESP.addCharacterModalHtml();
  } else {
    modalRoot.innerHTML = '';
  }

  // Append skill search popup into modal-root (outside early returns)
  const searchPopup = ESP.skillSearchPopupHtml ? ESP.skillSearchPopupHtml() : '';
  if (searchPopup) {
    modalRoot.insertAdjacentHTML('beforeend', searchPopup);
  }

  // Manage the minimized pill on document.body
  const existingPill = document.querySelector('.skill-search-pill');
  const newPill = ESP.skillSearchPillHtml ? ESP.skillSearchPillHtml() : '';

  if (existingPill && !newPill) {
    existingPill.remove();
  } else if (newPill && !existingPill) {
    document.body.insertAdjacentHTML('beforeend', newPill);
  } else if (newPill && existingPill) {
    existingPill.outerHTML = newPill;
  }
};