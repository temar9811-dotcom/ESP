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
    return;
  }

  if (ESP.state.groupState) {
    modalRoot.innerHTML = ESP.groupModalHtml();
    return;
  }

  if (ESP.state.planDetail) {
    modalRoot.innerHTML = ESP.planDetailModalHtml(ESP.state.planDetail);
    return;
  }

  if (ESP.state.settingsOpen) {
    modalRoot.innerHTML = ESP.settingsModalHtml(ESP.state.settings);
    return;
  }

  if (ESP.state.addCharacter) {
    modalRoot.innerHTML = ESP.addCharacterModalHtml();
    return;
  }

  modalRoot.innerHTML = '';
};