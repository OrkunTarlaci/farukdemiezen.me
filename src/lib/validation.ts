import { z } from 'zod'
import { normalizeTrPhone } from './phone'

export const NOTE_MAX = 300

export const customerSchema = z.object({
  firstName: z.string().trim().min(1, 'Adınızı girin.').max(60, 'Ad en fazla 60 karakter olabilir.'),
  lastName: z.string().trim().min(1, 'Soyadınızı girin.').max(60, 'Soyad en fazla 60 karakter olabilir.'),
  phone: z
    .string()
    .trim()
    .min(1, 'Telefon numaranızı girin.')
    .refine((v) => normalizeTrPhone(v) !== null, 'Geçerli bir cep telefonu girin (örn. 0532 123 45 67).'),
  email: z
    .string()
    .trim()
    .max(254, 'E-posta adresi çok uzun.')
    .refine((v) => v === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Geçerli bir e-posta adresi girin.'),
  // Sunucu notu kırptıktan sonra sayar; istemci de aynısını yapar.
  note: z.string().trim().max(NOTE_MAX, `Not en fazla ${NOTE_MAX} karakter olabilir.`),
})

export type CustomerFormValues = z.infer<typeof customerSchema>
