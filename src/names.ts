export function getName(id: number) {
  if (id === 0) return 'Author'
  return 'Commenter №' + `${id}`.padStart(4, '0')
}
