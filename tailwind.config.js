module.exports = {
  purge: ['./public/**/*.{js,jsx,ts,tsx,html}'],
  darkMode: false, // or 'media' or 'class'
  theme: {
    extend: {
      colors: {
        primary: {
          '50': '#f7f7fd',
          '100': '#efeffa',
          '200': '#d7d7f3',
          '300': '#bfbfeb',
          '400': '#8e90dd',
          '500': '#5e60ce',
          '600': '#5556b9',
          '700': '#47489b',
          '800': '#383a7c',
          '900': '#2e2f65',
        },
      },
    },
  },
  variants: {
    extend: {},
  },
  plugins: [],
};
