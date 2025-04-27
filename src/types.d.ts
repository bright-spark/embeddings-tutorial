// Declare that importing a .csv file yields a string
declare module '*.csv' {
  const content: string;
  export default content;
}
