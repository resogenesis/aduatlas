// Mobile menu toggle
const menuToggle = document.getElementById('menuToggle');
const navLinks = document.getElementById('navLinks');

menuToggle.addEventListener('click', () => {
  menuToggle.classList.toggle('active');
  navLinks.classList.toggle('open');
});

// Close menu on link click
navLinks.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    menuToggle.classList.remove('active');
    navLinks.classList.remove('open');
  });
});

// Form submission
const form = document.getElementById('signupForm');
const successMsg = document.getElementById('successMsg');

form.addEventListener('submit', (e) => {
  e.preventDefault();
  form.style.display = 'none';
  successMsg.classList.remove('hidden');
});
