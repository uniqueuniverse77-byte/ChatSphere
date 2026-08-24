(function () {
  function initFaq() {
    var items = document.querySelectorAll('.faq-item');
    if (!items.length) return;

    function getParts(item) {
      return {
        answer: item.querySelector('.faq-answer'),
        question: item.querySelector('.faq-question'),
        icon: item.querySelector('.faq-icon')
      };
    }

    function closeItem(item) {
      var parts = getParts(item);
      if (!parts.answer || !parts.question) return;
      parts.answer.classList.remove('active');
      parts.answer.style.height = '0px';
      parts.question.setAttribute('aria-expanded', 'false');
      if (parts.icon) parts.icon.textContent = '+';
    }

    function openItem(item) {
      var parts = getParts(item);
      if (!parts.answer || !parts.question) return;
      parts.answer.classList.add('active');
      parts.answer.style.height = parts.answer.scrollHeight + 'px';
      parts.question.setAttribute('aria-expanded', 'true');
      if (parts.icon) parts.icon.textContent = '-';
    }

    for (var i = 0; i < items.length; i++) {
      (function (item, index) {
        var parts = getParts(item);
        if (!parts.answer || !parts.question) return;

        var answerId = parts.answer.id || 'faq-answer-' + (index + 1);
        parts.answer.id = answerId;
        parts.question.setAttribute('type', 'button');
        parts.question.setAttribute('aria-controls', answerId);
        closeItem(item);

        parts.question.addEventListener('click', function () {
          var isOpen = parts.answer.classList.contains('active');
          for (var j = 0; j < items.length; j++) {
            if (items[j] !== item) closeItem(items[j]);
          }
          if (isOpen) closeItem(item);
          else openItem(item);
        });
      })(items[i], i);
    }

    window.addEventListener('resize', function () {
      for (var i = 0; i < items.length; i++) {
        var answer = items[i].querySelector('.faq-answer.active');
        if (answer) answer.style.height = answer.scrollHeight + 'px';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFaq);
  } else {
    initFaq();
  }
})();
