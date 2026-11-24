function categoriesPage() {
  const available = (S.data.category_catalog || []).filter((c) => !Number(c.selected));
  return renderTemplate('categories', {
    heading: heading(
      t('settings'),
      t('category_settings_intro'),
      `<div class="button-row">${button('request_category', 'request-category', 'secondary')}<button class="btn primary" data-action="new-category">${icon('plus')}${t('new_category')}</button></div>`
    ),
    chosenTitle: t('chosen_categories'),
    chosenHint: t('chosen_categories_hint'),
    chosenCategories: S.data.categories.length
      ? `<div class="category-grid">${S.data.categories
          .map((c) => {
            const count = S.data.habits.filter(
              (h) => h.permission === 'owner' && Number(h.category_id) === Number(c.id)
            ).length;
            return `<article class="category-card" style="--category-color:${esc(c.color)}"><button class="category-open" data-action="filter-category" data-id="${c.id}"><span class="category-icon">${icon(c.icon)}</span><h3>${esc(categoryName(c))}</h3><p>${t('habits_count', { count })}</p></button><div class="category-card-bottom">${badge(c.owner_user_id ? 'private' : 'global')}${c.owner_user_id ? `<button class="text-btn" data-action="edit-category" data-id="${c.id}">${t('edit')}</button>` : `<button class="text-btn" data-action="leave-category" data-id="${c.id}">${t('remove_category_choice')}</button>`}</div></article>`;
          })
          .join('')}</div>`
      : empty('choose_your_categories', 'category_settings_intro'),
    availableTitle: t('available_categories'),
    availableHint: t('available_categories_hint'),
    availableCategories: available.length
      ? `<div class="category-grid">${available.map((c) => `<article class="category-card" style="--category-color:${esc(c.color)}"><span class="category-icon">${icon(c.icon)}</span><h3>${esc(categoryName(c))}</h3>${c.description ? `<p>${esc(c.description)}</p>` : ''}<button class="btn secondary full category-join" data-action="join-category" data-id="${c.id}">${icon('plus')}${t('add_category_choice')}</button></article>`).join('')}</div>`
      : empty('all_categories_chosen'),
    lockIcon: icon('lock'),
    privacyHint: t('private_category_hint'),
    requestsTitle: t('my_requests'),
    requests: S.data.requests.length
      ? S.data.requests
          .map(
            (r) =>
              `<div class="request-row"><div><strong>${esc(r.name)}</strong><p>${esc(r.feedback || r.reason)}</p></div>${badge(r.status)}</div>`
          )
          .join('')
      : empty('no_requests'),
  });
}

function categoryForm(c = null, global = false, request = false) {
  openModal(
    request ? 'request_category' : c ? 'edit' : 'new_category',
    `<form data-form="${request ? 'requestCategory' : global ? 'saveGlobalCategory' : 'saveCategory'}">${c ? `<input type="hidden" name="id" value="${c.id}">` : ''}${field('name', 'name', 'text', c ? categoryName(c) : '', { required: true, maxlength: 100 })}${textarea('description', 'description', c?.description || '')}<div class="form-grid">${selectField(
      'icon',
      'icon',
      [
        'sparkles',
        'dumbbell',
        'flower',
        'book',
        'heart',
        'leaf',
        'sun',
        'moon',
        'coffee',
        'music',
        'briefcase',
      ].map((i) => [i, t(i)]),
      c?.icon || 'sparkles'
    )}${field('color', 'color', 'color', c?.color || '#B8A4D4')}</div>${request ? textarea('reason', 'reason', '', true) : ''}${formFooter(request ? 'send_request' : c ? 'save' : 'create', c ? `<button type="button" class="text-btn danger" data-action="delete-category" data-id="${c.id}" data-global="${global}">${t('delete')}</button>` : '')}</form>`
  );
}

function chooseCategoryFirst() {
  openModal(
    'choose_categories',
    `<p>${t('choose_category_first')}</p><div class="form-footer">${button('choose_categories', 'manage-categories', 'primary')}</div>`
  );
}

class CategoriesPage extends PageController {
  constructor() {
    super([
      'new-category',
      'edit-category',
      'request-category',
      'delete-category',
      'manage-categories',
      'join-category',
      'leave-category',
    ]);
  }

  async handleAction(action, el, id) {
    switch (action) {
      case 'new-category':
        categoryForm();
        break;
      case 'edit-category':
        categoryForm(S.data.categories.find((c) => Number(c.id) === id));
        break;
      case 'request-category':
        categoryForm(null, false, true);
        break;
      case 'delete-category':
        confirmAction('delete_category_confirm', () =>
          mutate(el.dataset.global === 'true' ? 'deleteGlobalCategory' : 'deleteCategory', { id })
        );
        break;
      case 'manage-categories':
        closeModal();
        await navigate('settings');
        break;
      case 'join-category':
        await mutate('joinCategory', { id }, 'category_added');
        break;
      case 'leave-category':
        await mutate('leaveCategory', { id }, 'category_removed');
        break;
    }
  }
}
