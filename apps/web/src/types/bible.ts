export interface Translation {
  id: number
  abbreviation: string
  title: string
  language: string
  is_copyrighted: boolean
  is_downloaded: boolean
}

export interface Book {
  id: number
  translation_id: number
  book_number: number
  name: string
  abbreviation: string
  testament: "OT" | "NT"
}

export interface Verse {
  id: number
  translation_id: number
  book_number: number
  book_name: string
  book_abbreviation: string
  chapter: number
  verse: number
  text: string
}

export interface CrossReference {
  from_ref: string
  to_ref: string
  votes: number
}
