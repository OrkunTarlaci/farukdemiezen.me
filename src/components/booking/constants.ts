/** Bilgiler formunun kimliği: "Devam" düğmesi formun dışında olduğu için form özniteliğiyle bağlanır. */
export const DETAILS_FORM_ID = 'musteri-bilgileri'

/** Bilgiler adımı (zod + react-hook-form) ayrı bir parçada yüklenir; bir önceki adımda önceden getirilir. */
export const loadDetailsStep = () => import('./DetailsStep')
