// Unified Designer iframe router.
//
// Nav-button routing convention:
//   - data-src present  → iframe.src = data-src (standalone tools that
//                         don't follow the *-designer.html naming, e.g.
//                         tools/enemy-hydrator.html).
//   - data-src absent   → iframe.src = `${data-designer}-designer.html`
//                         (legacy convention for the asset/map/world/...
//                         designer family).
document.addEventListener('DOMContentLoaded', () => {
    const iframe = document.getElementById('designer-iframe');
    const navButtons = document.querySelectorAll('.nav-btn');

    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const designer = btn.dataset.designer;
            const explicitSrc = btn.dataset.src;
            iframe.src = explicitSrc || `${designer}-designer.html`;

            navButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
});
