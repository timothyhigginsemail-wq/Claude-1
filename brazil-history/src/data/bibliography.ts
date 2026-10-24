export interface Ref {
  text: string
  url?: string
  group: 'Syntheses' | 'Colonial & Atlantic' | 'Empire & slavery' | 'Rio de Janeiro' | 'Republic, culture & race' | 'Political economy' | 'Data & primary sources' | 'Contemporary (dated)'
}

export const bib: Record<string, Ref> = {
  // ---------- Syntheses ----------
  fausto: { group: 'Syntheses', text: 'Boris Fausto & Sergio Fausto, A Concise History of Brazil, 2nd ed. (Cambridge University Press, 2014).' },
  schwarcz: { group: 'Syntheses', text: 'Lilia M. Schwarcz & Heloisa M. Starling, Brazil: A Biography (Farrar, Straus & Giroux, 2018; orig. Brasil: Uma Biografia, 2015).' },
  skidmore: { group: 'Syntheses', text: 'Thomas E. Skidmore, Brazil: Five Centuries of Change, 2nd ed. (Oxford University Press, 2010).' },
  prado: { group: 'Syntheses', text: 'Caio Prado Jr., Formação do Brasil Contemporâneo (1942) — the classic statement that colonial Brazil existed to supply Europe.' },
  holanda: { group: 'Syntheses', text: 'Sérgio Buarque de Holanda, Raízes do Brasil (1936).' },
  fgvAtlas: { group: 'Syntheses', text: 'FGV CPDOC, Atlas Histórico do Brasil.', url: 'https://atlas.fgv.br/' },
  cpdoc: { group: 'Syntheses', text: 'FGV CPDOC, Dicionário Histórico-Biográfico Brasileiro (online).', url: 'https://www18.fgv.br/cpdoc/acervo/dicionarios/verbetes' },

  // ---------- Colonial & Atlantic ----------
  hemming: { group: 'Colonial & Atlantic', text: 'John Hemming, Red Gold: The Conquest of the Brazilian Indians, 1500–1760 (Harvard University Press, 1978).' },
  denevan: { group: 'Colonial & Atlantic', text: 'William M. Denevan (ed.), The Native Population of the Americas in 1492, 2nd ed. (University of Wisconsin Press, 1992).' },
  heckenberger: { group: 'Colonial & Atlantic', text: 'Michael J. Heckenberger et al., “Pre-Columbian Urbanism, Anthropogenic Landscapes, and the Future of the Amazon,” Science 321 (2008): 1214–17.' },
  neves: { group: 'Colonial & Atlantic', text: 'Eduardo Góes Neves, Sob os Tempos do Equinócio: Oito Mil Anos de História na Amazônia Central (Ubu/Edusp, 2022).' },
  boxerSeaborne: { group: 'Colonial & Atlantic', text: 'C. R. Boxer, The Portuguese Seaborne Empire, 1415–1825 (Hutchinson, 1969).' },
  boxerGold: { group: 'Colonial & Atlantic', text: 'C. R. Boxer, The Golden Age of Brazil, 1695–1750 (University of California Press, 1962).' },
  schwartz: { group: 'Colonial & Atlantic', text: 'Stuart B. Schwartz, Sugar Plantations in the Formation of Brazilian Society: Bahia, 1550–1835 (Cambridge University Press, 1985).' },
  alencastro: { group: 'Colonial & Atlantic', text: 'Luiz Felipe de Alencastro, O Trato dos Viventes: Formação do Brasil no Atlântico Sul (Companhia das Letras, 2000); Eng. trans. The Trade in the Living (SUNY Press, 2018).' },
  eltis: { group: 'Colonial & Atlantic', text: 'David Eltis & David Richardson, Atlas of the Transatlantic Slave Trade (Yale University Press, 2010).' },
  russellWood: { group: 'Colonial & Atlantic', text: 'A. J. R. Russell-Wood, “Colonial Brazil: The Gold Cycle, c. 1690–1750,” in L. Bethell (ed.), Cambridge History of Latin America, vol. II (1984).' },
  pinto: { group: 'Colonial & Atlantic', text: 'Virgílio Noya Pinto, O Ouro Brasileiro e o Comércio Anglo-Português (Companhia Editora Nacional, 1979).' },
  cortesao: { group: 'Colonial & Atlantic', text: 'Jaime Cortesão, Alexandre de Gusmão e o Tratado de Madrid (1950–59; reissued FUNAG, 2006).' },
  furtado: { group: 'Colonial & Atlantic', text: 'Celso Furtado, Formação Econômica do Brasil (1959); Eng. The Economic Growth of Brazil (1963).' },
  staden: { group: 'Colonial & Atlantic', text: 'Hans Staden, Warhaftige Historia (Marburg, 1557); Jean de Léry, Histoire d’un voyage faict en la terre du Brésil (1578); Michel de Montaigne, “Des cannibales,” Essais I.31 (1580).' },

  // ---------- Empire & slavery ----------
  klein: { group: 'Empire & slavery', text: 'Herbert S. Klein & Francisco Vidal Luna, Slavery in Brazil (Cambridge University Press, 2010).' },
  karasch: { group: 'Empire & slavery', text: 'Mary C. Karasch, Slave Life in Rio de Janeiro, 1808–1850 (Princeton University Press, 1987).' },
  conrad: { group: 'Empire & slavery', text: 'Robert Conrad, The Destruction of Brazilian Slavery, 1850–1888 (University of California Press, 1972).' },
  bethellAbolition: { group: 'Empire & slavery', text: 'Leslie Bethell, The Abolition of the Brazilian Slave Trade (Cambridge University Press, 1970).' },
  wilcken: { group: 'Empire & slavery', text: 'Patrick Wilcken, Empire Adrift: The Portuguese Court in Rio de Janeiro, 1808–1821 (Bloomsbury, 2004).' },
  schultz: { group: 'Empire & slavery', text: 'Kirsten Schultz, Tropical Versailles: Empire, Monarchy, and the Portuguese Royal Court in Rio de Janeiro, 1808–1821 (Routledge, 2001).' },
  cavalcanti: { group: 'Empire & slavery', text: 'Nireu Cavalcanti, O Rio de Janeiro Setecentista (Zahar, 2004) — revises downward the traditional size of the 1808 court.' },
  barman: { group: 'Empire & slavery', text: 'Roderick J. Barman, Brazil: The Forging of a Nation, 1798–1852 (Stanford, 1988) and Citizen Emperor: Pedro II and the Making of Brazil (Stanford, 1999).' },
  carvalhoOrdem: { group: 'Empire & slavery', text: 'José Murilo de Carvalho, A Construção da Ordem / Teatro de Sombras (1980/1988; Civilização Brasileira, 2003).' },
  stein: { group: 'Empire & slavery', text: 'Stanley J. Stein, Vassouras: A Brazilian Coffee County, 1850–1900 (Harvard University Press, 1957).' },
  dean: { group: 'Empire & slavery', text: 'Warren Dean, With Broadax and Firebrand: The Destruction of the Brazilian Atlantic Forest (University of California Press, 1995).' },
  summerhill: { group: 'Empire & slavery', text: 'William R. Summerhill, Inglorious Revolution: Political Institutions, Sovereign Debt, and Financial Underdevelopment in Imperial Brazil (Yale University Press, 2015).' },
  carvalhoBestializados: { group: 'Empire & slavery', text: 'José Murilo de Carvalho, Os Bestializados: O Rio de Janeiro e a República que não foi (Companhia das Letras, 1987).' },
  machado: { group: 'Empire & slavery', text: 'Maria Helena P. T. Machado, O Plano e o Pânico: Os Movimentos Sociais na Década da Abolição (UFRJ/Edusp, 1994); Eduardo Silva, As Camélias do Leblon e a Abolição da Escravatura (Companhia das Letras, 2003).' },

  // ---------- Rio ----------
  abreu: { group: 'Rio de Janeiro', text: 'Maurício de Almeida Abreu, Evolução Urbana do Rio de Janeiro, 4th ed. (Instituto Pereira Passos, 2008; orig. 1987).' },
  needell: { group: 'Rio de Janeiro', text: 'Jeffrey D. Needell, A Tropical Belle Époque: Elite Culture and Society in Turn-of-the-Century Rio de Janeiro (Cambridge University Press, 1987).' },
  benchimol: { group: 'Rio de Janeiro', text: 'Jaime Larry Benchimol, Pereira Passos: um Haussmann Tropical (Secretaria Municipal de Cultura, 1990).' },
  chalhoub: { group: 'Rio de Janeiro', text: 'Sidney Chalhoub, Cidade Febril: Cortiços e Epidemias na Corte Imperial (Companhia das Letras, 1996).' },
  sevcenko: { group: 'Rio de Janeiro', text: 'Nicolau Sevcenko, A Revolta da Vacina: Mentes Insanas em Corpos Rebeldes (Brasiliense, 1984).' },
  valladares: { group: 'Rio de Janeiro', text: 'Licia do Prado Valladares, A Invenção da Favela: Do Mito de Origem a favela.com (FGV, 2005).' },
  perlman: { group: 'Rio de Janeiro', text: 'Janice Perlman, Favela: Four Decades of Living on the Edge in Rio de Janeiro (Oxford University Press, 2010).' },
  unescoRio: { group: 'Rio de Janeiro', text: 'UNESCO World Heritage Centre, “Rio de Janeiro: Carioca Landscapes between the Mountain and the Sea” (inscribed 2012).', url: 'https://whc.unesco.org/en/list/1100/' },
  unescoValongo: { group: 'Rio de Janeiro', text: 'UNESCO World Heritage Centre, “Valongo Wharf Archaeological Site” (inscribed 2017).', url: 'https://whc.unesco.org/en/list/1548/' },
  lessa: { group: 'Rio de Janeiro', text: 'Carlos Lessa, O Rio de Todos os Brasis (Record, 2000).' },
  pereiraValongo: { group: 'Rio de Janeiro', text: 'Júlio César Medeiros da Silva Pereira, À Flor da Terra: O Cemitério dos Pretos Novos no Rio de Janeiro (Garamond/IPHAN, 2007); Tânia Andrade Lima et al., excavation reports on the Cais do Valongo (Museu Nacional/UFRJ, 2011–16).' },
  dean_tijuca: { group: 'Rio de Janeiro', text: 'José Augusto Drummond, Devastação e Preservação Ambiental no Rio de Janeiro (EdUFF, 1997) — on the 1861 Tijuca reforestation.' },

  // ---------- Republic, culture, race ----------
  leal: { group: 'Republic, culture & race', text: 'Victor Nunes Leal, Coronelismo, Enxada e Voto (1949).' },
  holloway: { group: 'Republic, culture & race', text: 'Thomas H. Holloway, Immigrants on the Land: Coffee and Society in São Paulo, 1886–1934 (University of North Carolina Press, 1980).' },
  skidmoreBlack: { group: 'Republic, culture & race', text: 'Thomas E. Skidmore, Black into White: Race and Nationality in Brazilian Thought (Oxford University Press, 1974).' },
  schwarczRacas: { group: 'Republic, culture & race', text: 'Lilia M. Schwarcz, O Espetáculo das Raças: Cientistas, Instituições e Questão Racial no Brasil, 1870–1930 (Companhia das Letras, 1993).' },
  freyre: { group: 'Republic, culture & race', text: 'Gilberto Freyre, Casa-Grande & Senzala (1933); Eng. The Masters and the Slaves (1946).' },
  fernandes: { group: 'Republic, culture & race', text: 'Florestan Fernandes, A Integração do Negro na Sociedade de Classes (1964).' },
  hasenbalg: { group: 'Republic, culture & race', text: 'Carlos Hasenbalg, Discriminação e Desigualdades Raciais no Brasil (Graal, 1979).' },
  vianna: { group: 'Republic, culture & race', text: 'Hermano Vianna, O Mistério do Samba (Zahar/UFRJ, 1995); Eng. The Mystery of Samba (UNC Press, 1999).' },
  mccann: { group: 'Republic, culture & race', text: 'Bryan McCann, Hello, Hello Brazil: Popular Music in the Making of Modern Brazil (Duke University Press, 2004).' },
  sandroni: { group: 'Republic, culture & race', text: 'Carlos Sandroni, Feitiço Decente: Transformações do Samba no Rio de Janeiro, 1917–1933 (Zahar, 2001).' },
  filho: { group: 'Republic, culture & race', text: 'Mário Filho, O Negro no Futebol Brasileiro (1947; 4th ed. Mauad, 2003).' },
  williams: { group: 'Republic, culture & race', text: 'Daryle Williams, Culture Wars in Brazil: The First Vargas Regime, 1930–1945 (Duke University Press, 2001).' },
  french: { group: 'Republic, culture & race', text: 'John D. French, Drowning in Laws: Labor Law and Brazilian Political Culture (UNC Press, 2004).' },
  holston: { group: 'Republic, culture & race', text: 'James Holston, The Modernist City: An Anthropological Critique of Brasília (University of Chicago Press, 1989).' },
  castro: { group: 'Republic, culture & race', text: 'Ruy Castro, Chega de Saudade: A História e as Histórias da Bossa Nova (Companhia das Letras, 1990).' },
  gaspari: { group: 'Republic, culture & race', text: 'Elio Gaspari, A Ditadura, 5 vols. (Companhia das Letras / Intrínseca, 2002–2016).' },
  cnv: { group: 'Republic, culture & race', text: 'Comissão Nacional da Verdade, Relatório Final (Brasília, December 2014).', url: 'http://cnv.memoriasreveladas.gov.br/' },
  fico: { group: 'Republic, culture & race', text: 'Carlos Fico, O Grande Irmão: Da Operação Brother Sam aos Anos de Chumbo (Civilização Brasileira, 2008).' },

  // ---------- Political economy ----------
  abreuMP: { group: 'Political economy', text: 'Marcelo de Paiva Abreu (ed.), A Ordem do Progresso: Dois Séculos de Política Econômica no Brasil, 2nd ed. (Elsevier, 2014).' },
  baer: { group: 'Political economy', text: 'Werner Baer, The Brazilian Economy: Growth and Development, 7th ed. (Lynne Rienner, 2014).' },
  fishlow: { group: 'Political economy', text: 'Albert Fishlow, “Brazilian Size Distribution of Income,” American Economic Review 62, no. 2 (1972); Carlos Langoni, Distribuição da Renda e Desenvolvimento Econômico do Brasil (1973).' },
  arida: { group: 'Political economy', text: 'Persio Arida & André Lara Resende, “Inertial Inflation and Monetary Reform,” in J. Williamson (ed.), Inflation and Indexation: Argentina, Brazil, and Israel (MIT Press/IIE, 1985).' },
  franco: { group: 'Political economy', text: 'Gustavo H. B. Franco, O Plano Real e Outros Ensaios (Francisco Alves, 1995).' },
  abranches: { group: 'Political economy', text: 'Sérgio Abranches, “Presidencialismo de coalizão: o dilema institucional brasileiro,” Dados 31, no. 1 (1988); and Presidencialismo de Coalizão (Companhia das Letras, 2018).' },
  souza: { group: 'Political economy', text: 'Pedro H. G. Ferreira de Souza, Uma História de Desigualdade: A Concentração de Renda entre os Ricos no Brasil, 1926–2013 (Hucitec/Anpocs, 2018).' },
  arretche: { group: 'Political economy', text: 'Marta Arretche (ed.), Trajetórias das Desigualdades: Como o Brasil Mudou nos Últimos Cinquenta Anos (Editora Unesp/CEM, 2015).' },
  summerhillRail: { group: 'Political economy', text: 'William R. Summerhill, Order Against Progress: Government, Foreign Investment, and Railroads in Brazil, 1854–1913 (Stanford, 2003).' },

  // ---------- Data ----------
  slavevoyages: { group: 'Data & primary sources', text: 'SlaveVoyages consortium, Trans-Atlantic Slave Trade Database — Estimates, 1501–1866 (Emory University et al.).', url: 'https://www.slavevoyages.org/assessment/estimates' },
  ibgeHist: { group: 'Data & primary sources', text: 'IBGE, Estatísticas Históricas do Brasil, 2nd ed. (1990), incl. export shares by decade from the Anuário Estatístico do Brasil (1939/40); Recenseamento Geral do Império (1872).' },
  ibgeCensus: { group: 'Data & primary sources', text: 'IBGE, Censos Demográficos 1872–2022 (population of Brazil, municipalities of Rio de Janeiro and São Paulo; urban share).', url: 'https://www.ibge.gov.br/estatisticas/sociais/populacao/22827-censo-demografico-2022.html' },
  ibge2022: { group: 'Data & primary sources', text: 'IBGE, Censo Demográfico 2022: Identificação étnico-racial; Indígenas; Favelas e Comunidades Urbanas (releases 2023–24).' },
  ipca: { group: 'Data & primary sources', text: 'IBGE, Índice Nacional de Preços ao Consumidor Amplo (IPCA), annual series 1980–2025; FGV IGP-DI for earlier years.' },
  ipeadata: { group: 'Data & primary sources', text: 'Ipeadata (IPEA), macroeconomic series: real GDP growth 1948–2024.', url: 'http://www.ipeadata.gov.br/' },
  wbGini: { group: 'Data & primary sources', text: 'World Bank, Poverty and Inequality Platform — Gini index, Brazil (household per-capita income, PNAD / PNAD Contínua).', url: 'https://pip.worldbank.org/' },
  census1849: { group: 'Data & primary sources', text: 'Recenseamento da Corte, 1849 (organised by R. J. Haddock Lobo): 266,466 inhabitants, of whom 110,602 enslaved — as analysed in Karasch (1987).' },
  levy: { group: 'Data & primary sources', text: 'Maria Stella Ferreira Levy, “O papel da migração internacional na evolução da população brasileira (1872 a 1972),” Revista de Saúde Pública 8 (supl.), 1974.' },
  nabuco: { group: 'Data & primary sources', text: 'Joaquim Nabuco, O Abolicionismo (London, 1883).' },
  lobo: { group: 'Data & primary sources', text: 'Aristides Lobo, letter in Diário Popular (São Paulo), 18 Nov. 1889 (“o povo assistiu àquilo bestializado”).' },
  vargasLetter: { group: 'Data & primary sources', text: 'Getúlio Vargas, Carta-Testamento, 24 Aug. 1954 (Arquivo Nacional / CPDOC).' },

  // ---------- Contemporary ----------
  tse2026: { group: 'Contemporary (dated)', text: 'Tribunal Superior Eleitoral first-round count, 4 Oct. 2026 (Flávio Bolsonaro 47.03%, Lula 45.16% of valid votes), as reported by Al Jazeera (5 & 23 Oct. 2026) and The Washington Post (4 Oct. 2026); runoff 25 Oct. 2026. Checked 24 Oct. 2026.' },
  bcb2026: { group: 'Contemporary (dated)', text: 'Banco Central do Brasil, Copom statement, 281st meeting (Sept. 2026): Selic 13.75%; Focus survey expectations. Checked 24 Oct. 2026.', url: 'https://www.bcb.gov.br/en/monetarypolicy/copomstatements' },
  stf2025: { group: 'Contemporary (dated)', text: 'Supremo Tribunal Federal, First Panel, AP 2668 (Sept. 2025): Jair Bolsonaro convicted of attempting a coup, sentenced to 27 years 3 months; humanitarian house arrest since March 2026 (Reuters/AP reports, 2025–26).' },
  rioOp2025: { group: 'Contemporary (dated)', text: 'Police operation in the Penha and Alemão complexes, 28 Oct. 2025: official count initially 64, later tallies of 120+ dead (Rio Public Defender’s Office; Human Rights Watch; IDEA Democracy Tracker, Oct. 2025).' },
  ibgeFavelas: { group: 'Contemporary (dated)', text: 'IBGE, Censo 2022 — Favelas e Comunidades Urbanas (Nov. 2024): 16.39 million people (8.1% of the population) nationally; Rocinha the most populous (72,021).' },
}

export const bibGroups: Ref['group'][] = ['Syntheses', 'Colonial & Atlantic', 'Empire & slavery', 'Rio de Janeiro', 'Republic, culture & race', 'Political economy', 'Data & primary sources', 'Contemporary (dated)']
